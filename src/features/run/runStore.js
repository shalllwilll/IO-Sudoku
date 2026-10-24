// Global run state. The reducer is pure and idempotent by sequence number, so duplicated or
// reordered events give the same final state. The store lives outside React so events that
// arrive during the page transition are never lost.
// Event names and status words are the backend's; see api/live/wire.js.
import { useSyncExternalStore } from "react";
import { EVENT, PIPELINE_STAGES, placementCount, RUN_STATUS } from "../../api/live/wire.js";

export const TERMINAL = [RUN_STATUS.finished, RUN_STATUS.failed, "cancelled"];
const LOG_LIMIT = 50;

export const STAGE_LABEL = {
  ingest: "Reading files",
  map: "Mapping columns",
  normalise: "Normalising",
  hardware: "Choosing hardware",
  layout: "Building blocks",
  pack: "Allocating",
};

export const initialRunState = {
  projectId: null,
  runId: null,
  fileNames: [],
  status: "idle",
  stage: null,
  stageSeq: 0,
  doneStages: 0,
  totalStages: PIPELINE_STAGES.length,
  placed: 0,
  tqs: [],
  log: [],
  seen: {},
  lastSeq: 0,
  error: null,
  notice: "",
  summary: null,
};

const stageName = (d) => STAGE_LABEL[d.stage] ?? d.stage ?? "?";

function describe(event) {
  const d = event.data ?? {};
  switch (event.type) {
    case EVENT.runStarted:
      return "Run started";
    case EVENT.stageStarted:
      return `Stage: ${stageName(d)}`;
    case EVENT.stageFinished:
      return `Stage done: ${stageName(d)}${d.reused ? " (reused)" : ""}`;
    case EVENT.placement:
      return `Placed ${placementCount(d)} signals`;
    case EVENT.groupFormed:
      return "Cable group formed";
    case EVENT.rejection:
      return `Held out ${d.signals ?? 0} signals: ${d.code ?? "?"}`;
    case EVENT.spareAssigned:
      return `Spares: ${d.wired_spare_pairs ?? 0} wired pairs, ${d.spare_slots ?? 0} free slots`;
    case EVENT.solverStatus:
      return `Solver ${d.solver ?? "?"}: ${d.status ?? "?"}`;
    case EVENT.fallback:
      return `Fallback from ${d.solver ?? "?"}`;
    case EVENT.tqRaised:
      return `TQ raised: ${d.code ?? "?"}`;
    case EVENT.validation:
      return d.ok ? "Validation passed" : `Validation: ${d.violations ?? 0} violations`;
    case EVENT.runFinished:
      return "Run finished";
    case EVENT.error:
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
    case EVENT.runStarted:
      if (!terminal) next.status = RUN_STATUS.running;
      break;
    case EVENT.stageStarted:
      if (event.seq > state.stageSeq) {
        next.stage = stageName(d);
        next.stageSeq = event.seq;
      }
      if (!terminal && state.status === "idle") next.status = RUN_STATUS.running;
      break;
    case EVENT.stageFinished:
      next.doneStages = Math.min(state.totalStages, state.doneStages + 1);
      break;
    case EVENT.placement:
      next.placed = state.placed + placementCount(d);
      break;
    case EVENT.tqRaised:
      if (d.id && !state.tqs.some((t) => t.id === d.id)) next.tqs = [...state.tqs, d];
      break;
    case EVENT.runFinished:
      if (!terminal) {
        next.status = RUN_STATUS.finished;
        next.summary = { allocated: d.allocated ?? 0, held_out: d.held_out ?? 0, tqs: d.tqs ?? 0, solver: d.solver ?? "" };
      }
      break;
    case EVENT.error:
      if (!terminal) {
        next.status = RUN_STATUS.failed;
        next.error = typeof d.message === "string" ? d.message : "The run failed.";
      }
      break;
    default:
      break; // group.formed, rejection, spare.assigned, solver.status, fallback.triggered, validation.result: logged only
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
