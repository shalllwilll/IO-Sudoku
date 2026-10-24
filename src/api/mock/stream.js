// Mock run event stream with adjustable behaviour for tests and demos (provisional, MI-1).
import { AuthError } from "../errors.js";

export const streamOptions = {
  intervalMs: 30,
  placementEvents: 10,
  dropAfter: null, // close once after this many events, then resume
  duplicateSeq: null,
  outOfOrder: false,
  malformed: false,
  failWith: null, // message: end with run.failed
  silent: false,
  unauthorized: false,
};

export function resetStreamOptions() {
  Object.assign(streamOptions, {
    intervalMs: 30,
    placementEvents: 10,
    dropAfter: null,
    duplicateSeq: null,
    outOfOrder: false,
    malformed: false,
    failWith: null,
    silent: false,
    unauthorized: false,
  });
}

const STAGES = ["Reading files", "Normalising", "Allocating", "Checking rules", "Writing output"];

function buildEvents(o) {
  const events = [{ type: "run.started", data: {} }];
  STAGES.forEach((name, index) => events.push({ type: "run.stage", data: { name, index, total: STAGES.length } }));
  for (let i = 0; i < o.placementEvents; i++) events.push({ type: "placement", data: { count: 19 } });
  events.push({ type: "tq.raised", data: { tq_id: "tq-1", code: "MISSING_CABLE", severity: "warning" } });
  events.push(o.failWith ? { type: "run.failed", data: { message: o.failWith } } : { type: "run.completed", data: {} });
  return events.map((e, i) => ({ ...e, seq: i + 1 }));
}

/** Returns { close }. Frames are { id, data: string }. onStatus(status) reports the terminal state. */
export function openMockStream(handlers, { lastEventId = 0 } = {}, onTerminal) {
  const o = { ...streamOptions };
  if (o.unauthorized) {
    streamOptions.unauthorized = false;
    queueMicrotask(() => handlers.onClose(new AuthError()));
    return { close() {} };
  }
  const events = buildEvents(o).filter((e) => e.seq > lastEventId);
  if (o.outOfOrder && events.length > 8) [events[6], events[5]] = [events[5], events[6]];
  const dropAt = o.dropAfter;
  if (dropAt != null) streamOptions.dropAfter = null; // drop only once
  let index = 0;
  let closed = false;

  const timer = setInterval(() => {
    if (closed || o.silent) return;
    if (dropAt != null && lastEventId === 0 && index >= dropAt) {
      closed = true;
      clearInterval(timer);
      handlers.onClose(new Error("dropped"));
      return;
    }
    const event = events[index++];
    if (!event) {
      closed = true;
      clearInterval(timer);
      return;
    }
    if (o.malformed && index === 3) handlers.onMessage({ id: "x", data: "{not json" });
    const frame = { id: String(event.seq), data: JSON.stringify(event) };
    handlers.onMessage(frame);
    if (o.duplicateSeq === event.seq) handlers.onMessage(frame);
    if (event.type === "run.completed") onTerminal?.("completed");
    if (event.type === "run.failed") onTerminal?.("failed", event.data.message);
  }, o.intervalMs);

  return {
    close() {
      closed = true;
      clearInterval(timer);
    },
  };
}
