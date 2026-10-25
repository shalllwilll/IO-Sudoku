// Signal identity and allocation/validation status are independent display dimensions.
export const IO_TYPES = {
  AI: { code: "AI", name: "Analog Input", color: "#1976D2" },
  AO: { code: "AO", name: "Analog Output", color: "#8E24AA" },
  DI: { code: "DI", name: "Digital Input", color: "#43A047" },
  DO: { code: "DO", name: "Digital Output", color: "#FB8C00" },
};
export const UNKNOWN_IO = { code: "UNKNOWN", name: "Unknown I/O Type", color: "#78818D" };
export const SPARE_IO = { code: "SPARE", name: "Spare / unused position", color: "#78818D" };
// AIR/AOR/DIR/DOR are the existing application's documented canonical wire aliases.
// Other strings are not inferred from a prefix, description, signal type, or CHARM part number.
const ALIASES = { AI: "AI", AIR: "AI", AO: "AO", AOR: "AO", DI: "DI", DIR: "DI", DO: "DO", DOR: "DO" };
export const positionKind = (raw) => String(raw ?? "").trim().toLowerCase().replace(/[_-]/g, " ");
const spareKinds = new Set(["spare slot", "reserved spare", "unused position", "unused", "empty", "spare", "wired spare"]);
export const isSpareRecord = (record) => spareKinds.has(positionKind(record?.kind));

export function ioType(raw) {
  const code = ALIASES[String(raw ?? "").trim().toUpperCase()];
  return IO_TYPES[code] ?? UNKNOWN_IO;
}

export function recordIo(record) {
  if (isSpareRecord(record)) return { ...SPARE_IO, name: record.kind === "wired spare" ? "Wired spare" : record.kind === "reserved spare" ? "Reserved spare" : "Spare / unused position" };
  return ioType(record?.ioType);
}

export function positionIo(records) {
  if (!records.length) return { ...SPARE_IO, name: "Unused position" };
  const definitions = records.map(recordIo);
  const codes = new Set(definitions.map((definition) => definition.code));
  if (codes.size === 1) return definitions[0];
  return { ...UNKNOWN_IO, conflict: true };
}
