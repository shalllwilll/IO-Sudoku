// The backend's wire vocabulary and the few conversions between it and the UI.
// This is the only file that knows event names, status words, placement kinds, TQ severities and
// the mapping shape. Source: origin/backend backend/docs/openapi.json and backend/app/core/*.
// The mock adapter emits these same shapes, so mock and live stay interchangeable.

export const RUN_STATUS = { running: "running", finished: "finished", failed: "failed" };

export const PIPELINE_STAGES = ["ingest", "map", "normalise", "hardware", "layout", "pack"];

export const EVENT = {
  runStarted: "run.started",
  stageStarted: "stage.started",
  stageFinished: "stage.finished",
  groupFormed: "group.formed",
  placement: "placement",
  rejection: "rejection",
  spareAssigned: "spare.assigned",
  solverStatus: "solver.status",
  fallback: "fallback.triggered",
  tqRaised: "tq.raised",
  validation: "validation.result",
  runFinished: "run.finished",
  error: "error",
};

/** The two events that end a stream. The backend sends exactly one of them. */
export const TERMINAL_EVENTS = [EVENT.runFinished, EVENT.error];

export const PLACEMENT_KIND = { field: "field", wiredSpare: "wired_spare", cabinetAlarm: "cabinet_alarm" };

export const TQ_SEVERITY = ["blocking", "assumed", "info"];

export const ANSWER_SCOPES = ["everywhere", "cable", "row"];

/** IO type of a placed position: field signals carry it on the signal, wired spares on the placement. */
export const ioTypeOf = (placement) =>
  placement?.kind === PLACEMENT_KIND.wiredSpare ? placement.io_type ?? null : placement?.signal?.io_type ?? null;

/** A signal key as the backend writes it in `signal_keys`: "<source file>:<source row>". */
export const signalKey = (file, row) => `${file ?? "?"}:${row ?? "?"}`;

/** Number of placements in a `placement` event. */
export const placementCount = (data) => (Array.isArray(data?.placements) ? data.placements.length : 0);

/**
 * UI mapping state is { columnIndex: field | "" } per sheet. The wire shape is
 * { fileName: { field: columnName } }. Blank column names cannot be named on the wire, and a field
 * can name one column only, so the first column in sheet order wins a duplicated field.
 */
export function confirmedToWire(sheets, assignmentsList) {
  const out = {};
  sheets.forEach((sheet, i) => {
    const fields = out[sheet.file] ?? {}; // sheets of one file share an entry: the wire keys by file name
    sheet.columns.forEach((column, index) => {
      const field = assignmentsList[i]?.[index];
      if (field && column && !(field in fields)) fields[field] = column;
    });
    out[sheet.file] = fields;
  });
  return out;
}

/** Reads one file's wire entry ({ field: columnName }) back into { columnIndex: field }. */
export function assignmentsFromWire(sheet, wireForFile) {
  const out = {};
  sheet.columns.forEach((_, index) => {
    out[String(index)] = "";
  });
  const byColumn = new Map();
  for (const [field, column] of Object.entries(wireForFile ?? {})) {
    if (!byColumn.has(column)) byColumn.set(column, field);
  }
  const taken = new Set();
  sheet.columns.forEach((column, index) => {
    if (byColumn.has(column) && !taken.has(column)) {
      out[String(index)] = byColumn.get(column);
      taken.add(column);
    }
  });
  return out;
}

/**
 * Body of POST /tqs/{id}/answer. `option` must be one of the TQ's own option labels.
 * Row scope targets the first signal key, cable scope the TQ's cable; an unavailable scope falls back to everywhere.
 */
export function buildAnswerBody(tq, { option, scope = "everywhere", value = "" }) {
  const cable = tq.data?.cable ?? null;
  const key = tq.signal_keys?.[0] ?? null;
  let effective = scope;
  if (scope === "cable" && !cable) effective = "everywhere";
  if (scope === "row" && !key) effective = "everywhere";
  return {
    option,
    scope: effective,
    target: effective === "cable" ? cable : effective === "row" ? key : null,
    value: value.trim() ? value.trim() : null,
    fields: {},
    author: "engineer",
  };
}

/** Which scopes a TQ can be answered at. */
export function scopesFor(tq) {
  return ANSWER_SCOPES.filter((s) => s === "everywhere" || (s === "cable" && tq.data?.cable) || (s === "row" && tq.signal_keys?.length));
}
