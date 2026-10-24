// Starts a run and keeps its event stream alive: batching per animation frame, reconnect with
// backoff, snapshot after a drop, silence notice, cancel. Lives outside React on purpose.
import { z } from "zod";
import { api } from "../../api/index.js";
import { AuthError } from "../../api/errors.js";
import { RUN_STATUS, TERMINAL_EVENTS } from "../../api/live/wire.js";
import { signOutSession } from "../../auth/session.js";
import { runStore, TERMINAL } from "./runStore.js";

export const controllerOptions = { backoff: [1000, 2000, 4000, 10000], silenceMs: 30000 };

const EventSchema = z.object({ seq: z.number().int().nonnegative(), type: z.string().max(60), data: z.any().optional() });

let stream = null;
let queue = [];
let flushHandle = null;
let reconnectTimer = null;
let silenceTimer = null;
let attempt = 0;
let current = null; // { projectId, runId }

const schedule = (fn) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(fn) : setTimeout(fn, 0));

function flush() {
  flushHandle = null;
  const batch = queue;
  queue = [];
  if (batch.length) runStore.dispatch(batch);
}

function armSilence() {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(() => {
    if (!TERMINAL.includes(runStore.getState().status)) runStore.patch({ notice: "Still working. You can keep waiting or cancel." });
  }, controllerOptions.silenceMs);
}

function teardown() {
  stream?.close();
  stream = null;
  clearTimeout(reconnectTimer);
  clearTimeout(silenceTimer);
  reconnectTimer = null;
}

function onMessage(frame) {
  let parsed;
  try {
    parsed = JSON.parse(frame.data);
  } catch {
    return; // malformed frame: ignored, the run continues
  }
  const checked = EventSchema.safeParse(parsed);
  if (!checked.success) return;
  attempt = 0;
  armSilence();
  queue.push(checked.data);
  if (!flushHandle) flushHandle = schedule(flush);
  if (TERMINAL_EVENTS.includes(checked.data.type)) {
    // Apply right away, then close.
    flush();
    teardown();
  }
}

async function reconnect() {
  if (!current || TERMINAL.includes(runStore.getState().status)) return;
  const { projectId, runId } = current;
  try {
    const snapshot = await api.getRun(projectId, runId);
    if (snapshot.status === RUN_STATUS.finished) return runStore.setTerminal(RUN_STATUS.finished);
    if (snapshot.status === RUN_STATUS.failed) return runStore.setTerminal(RUN_STATUS.failed, snapshot.error ?? "The run failed.");
  } catch (e) {
    if (e instanceof AuthError) return expire();
  }
  open();
}

function expire() {
  teardown();
  signOutSession({ expired: true });
}

function onClose(error) {
  stream = null;
  if (!current || TERMINAL.includes(runStore.getState().status)) return;
  if (error instanceof AuthError) return expire();
  const wait = controllerOptions.backoff[Math.min(attempt, controllerOptions.backoff.length - 1)];
  attempt += 1;
  runStore.patch({ notice: "Connection lost. Reconnecting." });
  reconnectTimer = setTimeout(reconnect, wait);
}

function open() {
  const { projectId, runId } = current;
  stream = api.openRunStream(projectId, runId, { onMessage, onClose }, { lastEventId: runStore.getState().lastSeq });
  armSilence();
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnect();
    }
  });
}

/** Starts a run. Throws if offline or the request fails. A second call while one is active is ignored. */
export async function startRun(projectId, { fileNames = [] } = {}) {
  const state = runStore.getState();
  if (current && state.projectId === projectId && state.status === "running") return null;
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new Error("You are offline. Nothing was started.");
  }
  teardown();
  queue = [];
  attempt = 0;
  try {
    const run = await api.startRun(projectId, {});
    current = { projectId, runId: run.id };
    runStore.reset({ projectId, runId: run.id, fileNames, status: "running" });
    open();
    return run;
  } catch (e) {
    if (e instanceof AuthError) expire();
    throw e;
  }
}

export function cancelRun() {
  teardown();
  queue = [];
  runStore.setTerminal("cancelled");
}

/** Test helper: forget everything. */
export function resetController() {
  teardown();
  queue = [];
  current = null;
  runStore.reset();
}
