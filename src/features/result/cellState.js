import { ioTypeOf, PLACEMENT_KIND } from "../../api/live/wire.js";
import { directionOf, normaliseIoType } from "../values/normaliseIoType.js";

export const STATES = ["input", "output", "spareSlot", "wiredSpare", "reservedAlarm", "emptyBaseplate", "tq", "unknown"];

/**
 * State of one position. Pure.
 * placement: the placement at this position or null; baseplateUsed: the baseplate holds at least
 * one placement; reserved: the baseplate is reserved (alarms); hasTq: an open TQ names this signal.
 * A "spare slot" is a free position on a used baseplate. A wholly empty baseplate is a different state.
 */
export function cellState({ placement, baseplateUsed, reserved = false, hasTq = false }) {
  if (hasTq && placement) return "tq";
  if (!placement) {
    if (reserved) return "reservedAlarm";
    return baseplateUsed ? "spareSlot" : "emptyBaseplate";
  }
  if (placement.kind === PLACEMENT_KIND.wiredSpare) return "wiredSpare";
  if (placement.kind === PLACEMENT_KIND.cabinetAlarm || placement.signal?.cabinet_alarm) return "reservedAlarm";
  const base = normaliseIoType(ioTypeOf(placement)).base;
  const direction = directionOf(base);
  return direction ?? "unknown";
}

// Second cue per state, so meaning never depends on colour alone.
export const STATE_STYLE = {
  input: { label: "Input", glyph: "↓", className: "border-data-input text-data-input", outline: "solid" },
  output: { label: "Output", glyph: "↑", className: "border-data-output text-data-output", outline: "solid" },
  spareSlot: { label: "Spare slot", glyph: "", className: "border-data-spare text-data-spare", outline: "dashed" },
  wiredSpare: { label: "Wired spare", glyph: "w", className: "border-data-wiredSpare text-data-wiredSpare", outline: "dotted" },
  reservedAlarm: { label: "Reserved (alarm)", glyph: "R", className: "border-data-reserved text-data-reserved", outline: "solid" },
  emptyBaseplate: { label: "Empty baseplate", glyph: "", className: "border-steel text-steel", outline: "solid" },
  tq: { label: "TQ", glyph: "!", className: "border-data-tq text-data-tq", outline: "solid" },
  unknown: { label: "Unknown", glyph: "?", className: "border-steel text-soft-white", outline: "solid" },
};
