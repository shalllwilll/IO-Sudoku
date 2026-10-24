// Mock run event stream with adjustable behaviour for tests and demos. Events use the backend's
// names and shapes: {seq, type, at, data}. See api/live/wire.js.
import { AuthError } from "../errors.js";
import { EVENT, PIPELINE_STAGES, RUN_STATUS } from "../live/wire.js";

export const streamOptions = {
  intervalMs: 30,
  placementEvents: 10,
  dropAfter: null, // close once after this many events, then resume
  duplicateSeq: null,
  outOfOrder: false,
  malformed: false,
  failWith: null, // message: end with an error event
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

function batch(n, size) {
  return {
    batch: n,
    count: size,
    placements: Array.from({ length: size }, (_, i) => ({ cioc_no: 1, baseplate: 1 + (i % 8), channel: 1 + (i % 12), kind: "field", tag: `MOCK-${n}-${i}`, block_id: null })),
  };
}

function buildEvents(o) {
  const events = [{ type: EVENT.runStarted, data: { project_id: "p", uploads: 1, params: {} } }];
  PIPELINE_STAGES.forEach((stage) => {
    events.push({ type: EVENT.stageStarted, data: { stage } });
    events.push({ type: EVENT.stageFinished, data: { stage, reused: false, seconds: 0.1 } });
  });
  events.push({ type: EVENT.groupFormed, data: { group: { id: "G1", cables: ["CBL-1"], positions: 6, signals: 6 } } });
  for (let i = 0; i < o.placementEvents; i++) events.push({ type: EVENT.placement, data: batch(i + 1, 19) });
  events.push({ type: EVENT.rejection, data: { code: "TQ-DATA", message: "IO type could not be read.", signals: 1, keys: [] } });
  events.push({ type: EVENT.spareAssigned, data: { wired_spare_pairs: 4, spare_slots: 20, by_io_type: {} } });
  events.push({ type: EVENT.solverStatus, data: { solver: "greedy", status: "done", detail: "" } });
  events.push({ type: EVENT.tqRaised, data: { id: "tq-1", code: "TQ-DATA", severity: "assumed", category: "missing data", message: "Cable is missing for this signal.", signals: 1 } });
  events.push({ type: EVENT.validation, data: { ok: true, violations: 0, items: [] } });
  events.push(
    o.failWith
      ? { type: EVENT.error, data: { code: "run_failed", message: o.failWith } }
      : { type: EVENT.runFinished, data: { status: "finished", allocated: 190, held_out: 1, tqs: 1, solver: "greedy" } },
  );
  const at = new Date().toISOString();
  return events.map((e, i) => ({ ...e, seq: i + 1, at }));
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
    if (event.type === EVENT.runFinished) onTerminal?.(RUN_STATUS.finished);
    if (event.type === EVENT.error) onTerminal?.(RUN_STATUS.failed, event.data.message);
  }, o.intervalMs);

  return {
    close() {
      closed = true;
      clearInterval(timer);
    },
  };
}
