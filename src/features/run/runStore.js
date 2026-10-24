// Global run state. The reducer is pure and idempotent by sequence number, so duplicated or
// reordered events give the same final state. The store lives outside React so events that
// arrive during the page transition are never lost.
// Event names are provisional (MI-1): run.started, run.stage, placement, rule.status,
// tq.raised, run.completed, run.failed.
import { useSyncExternalStore } from "react";

export const TERMINAL = ["completed", "failed", "cancelled"];
const LOG_LIMIT = 50;

export const initialRunState = {
  projectId: null,
  runId: null,
  fileNames: [],
  status: "idle",
  stage: null,
  stageSeq: 0,
  doneStages: 0,
  totalStages: null,
  placed: 0,
  tqs: [],
  log: [],
  seen: {},
  lastSeq: 0,
  error: null,
  notice: "",
};

function describe(event) {
  const d = event.data ?? {};
  switch (event.type) {
    case "run.started":
      return "Run started";
    case "run.stage":
      return `Stage: ${d.name ?? "?"}`;
    case "placement":
      return `Placed ${d.count ?? d.items?.length ?? 1} signals`;
    case "rule.status":
      return `Rule ${d.rule ?? "?"}: ${d.status ?? "?"}`;
    case "tq.raised":
      return `TQ raised: ${d.code ?? "?"}`;
    case "run.completed":
      return "Run completed";
    case "run.failed":
      return "Run failed";
    default:
      return event.type;
  }
}

export function reduce(state, event) {
  if (!event || !Number.isInteger(event.seq) || state.seen[event.seq]) return state;
  const next = { ...state, seen: { ...state.seen, [event.seq]: true }, lastSeq: Math.max(state.lastSeq, event.seq) };
  const d = event.data ?? {};
  const terminal = TERMINAL.includes(state.status);

  switch (event.type) {
    case "run.started":
      if (!terminal) next.status = "running";
      break;
    case "run.stage":
      if (event.seq > state.stageSeq) {
        next.stage = d.name ?? null;
        next.stageSeq = event.seq;
        next.doneStages = Number.isFinite(d.index) ? d.index : state.doneStages;
        next.totalStages = Number.isFinite(d.total) ? d.total : state.totalStages;
      }
      if (!terminal && state.status === "idle") next.status = "running";
      break;
    case "placement":
      next.placed = state.placed + (d.count ?? d.items?.length ?? 1);
      break;
    case "tq.raised":
      if (d.tq_id && !state.tqs.some((t) => t.tq_id === d.tq_id)) next.tqs = [...state.tqs, d];
      break;
    case "run.completed":
      if (!terminal) next.status = "completed";
      break;
    case "run.failed":
      if (!terminal) {
        next.status = "failed";
        next.error = typeof d.message === "string" ? d.message : "The run failed.";
      }
      break;
    default:
      break;
  }
  next.log = [...state.log, { seq: event.seq, text: describe(event) }].sort((a, b) => a.seq - b.seq).slice(-LOG_LIMIT);
  return next;
}

let state = initialRunState;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export const runStore = {
  getState: () => state,
  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset(patch = {}) {
    state = { ...initialRunState, ...patch };
    emit();
  },
  patch(patch) {
    state = { ...state, ...patch };
    emit();
  },
  dispatch(events) {
    let next = state;
    for (const event of events) next = reduce(next, event);
    if (next !== state) {
      state = { ...next, notice: "" };
      emit();
    }
  },
  setTerminal(status, error = null) {
    if (TERMINAL.includes(state.status)) return;
    state = { ...state, status, error };
    emit();
  },
};

export function useRunState() {
  return useSyncExternalStore(runStore.subscribe, runStore.getState, runStore.getState);
}
