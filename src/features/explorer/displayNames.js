// Presentation labels derived from a record's own fields. They never replace a source identifier,
// never feed allocation, and are rebuilt from each loaded dataset, so nothing carries over between files.

// "P30-DCM-32001-01" -> unit 320, cabinet 01. Identifiers in any other shape keep their own text.
const CABINET_ID = /^[A-Za-z]\d+-[A-Za-z]+-(\d{3})\d{2}-(\d{2})$/;

export function cabinetDisplay(id, unit = "") {
  const match = CABINET_ID.exec(String(id ?? "").trim());
  if (!match) return "";
  return `Unit ${String(unit || match[1]).trim()} — Cabinet ${match[2]}`;
}

// "OA-11" -> "Process Area 11". The code stays visible next to it wherever it is shown.
export function areaDisplay(code) {
  const match = /^OA-(\d+)$/i.exec(String(code ?? "").trim());
  return match ? `Process Area ${match[1]}` : "";
}

export function areaText(code) {
  const label = areaDisplay(code);
  return label ? `${label} (${code})` : String(code ?? "");
}

const DEMO_PREFIX = /^synthetic demo\s*[—–-]\s*/i;

// A function phrase is added only when the row's own description names the instrument.
const FUNCTION_HINTS = [
  [/pressure transmitter/i, "process pressure monitoring"],
  [/flow transmitter/i, "process flow measurement"],
  [/temperature transmitter|resistance temperature detector/i, "process temperature measurement"],
  [/level transmitter/i, "process level measurement"],
  [/level switch/i, "discrete level condition"],
  [/pressure switch/i, "discrete pressure condition"],
  [/solenoid/i, "on/off valve actuation"],
  [/position switch/i, "equipment or valve position feedback"],
  [/hand switch/i, "operator command input"],
  [/horn/i, "audible alarm output", "Horn"],
];

export function signalDisplayName(record) {
  const service = String(record?.description ?? "").replace(DEMO_PREFIX, "").trim();
  if (!service) return "";
  const hint = FUNCTION_HINTS.find(([pattern]) => pattern.test(service));
  const name = hint?.[2] ?? service.charAt(0).toUpperCase() + service.slice(1);
  return hint && !/—/.test(name) ? `${name} — ${hint[1]}` : name;
}

export const nodeLabel = (node) => node?.display || node?.label || "";
