// Deterministic descriptions. Templated text, never model output, so it always matches the data.
import { STATE_STYLE } from "./cellState.js";

const text = (v) => (v === null || v === undefined || v === "" ? "unknown" : String(v));

/** item: { kind: "cell" | "baseplate" | "cioc" | "cabinet", ... } */
export function brief(item) {
  switch (item.kind) {
    case "cell": {
      const { state, placement: p, ciocName, bpName, channel } = item;
      const where = `${ciocName}, ${bpName}, channel ${channel}`;
      if (state === "wiredSpare") return `Wired spare on cable ${text(p?.cable)}, pair ${text(p?.pair)}, in ${where}.`;
      if (state === "spareSlot") return `Free position on a used baseplate in ${where}. It stays empty as a spare.`;
      if (state === "emptyBaseplate") return `Unused baseplate position in ${where}. The whole baseplate is a cabinet spare.`;
      if (state === "reservedAlarm") return `Position reserved for cabinet alarms in ${where}.`;
      const s = p?.signal ?? {};
      const prefix = state === "tq" ? "Open TQ on " : "";
      return `${prefix}${text(p?.io_type)} signal ${text(s.tag)} on cable ${text(s.cable ?? p?.cable)}, pair ${text(s.pair ?? p?.pair)}, placed in ${where}.`;
    }
    case "baseplate":
      return `${item.name} in ${item.ciocName}: ${item.signals} signals (${item.inputs} inputs, ${item.outputs} outputs), ${item.spares} spares, ${item.tqs} TQs.`;
    case "cioc":
      return `${item.name} in ${item.cabinetName}: ${item.signals} signals (${item.inputs} inputs, ${item.outputs} outputs), ${item.spares} spares, ${item.tqs} TQs.`;
    case "cabinet":
      return `${item.name}: ${item.signals} signals (${item.inputs} inputs, ${item.outputs} outputs), ${item.spares} spares, ${item.tqs} TQs, ${item.fillPct}% full.`;
    default:
      return "";
  }
}

export const stateLabel = (state) => STATE_STYLE[state]?.label ?? "Unknown";
