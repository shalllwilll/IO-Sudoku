// Colours and the second cue for each position state in the scene. The colours are the same data
// colours the 2D grid uses (tailwind.config.js), so a cell and its CHARM never disagree.
// Every state also has a shape cue, because colour alone must never carry the meaning: a greyscale
// screenshot still tells the states apart (T-6.5-9).
import { STATE_STYLE } from "../features/result/cellState.js";

export const COLOR = {
  input: "#5BC0EB",
  output: "#F4A259",
  spare: "#9AA3AE",
  wiredSpare: "#6BD9A8",
  reserved: "#B794F4",
  tq: "#FF6B6B",
  steel: "#41464E",
  gunmetal: "#262A30",
  softWhite: "#D7DADF",
  carbon: "#1C1F23",
  graphite: "#141619",
};

// `arrow`: which way the wire points, into the cabinet for an input and out for an output.
// `height`: a fraction of the CHARM body, so a spare slot is visibly a stub, not a module.
export const STATE_3D = {
  input: { color: COLOR.input, arrow: "in", height: 1, label: "Input" },
  output: { color: COLOR.output, arrow: "out", height: 1, label: "Output" },
  spareSlot: { color: COLOR.spare, arrow: null, height: 0.25, label: "Spare slot" },
  wiredSpare: { color: COLOR.wiredSpare, arrow: null, height: 0.65, label: "Wired spare" },
  reservedAlarm: { color: COLOR.reserved, arrow: "in", height: 0.85, label: "Reserved (alarm)" },
  emptyBaseplate: { color: COLOR.steel, arrow: null, height: 0.12, label: "Cabinet spare" },
  tq: { color: COLOR.tq, arrow: null, height: 1, label: "TQ" },
  unknown: { color: COLOR.steel, arrow: null, height: 0.5, label: "Unknown" },
};

export const style3d = (state) => STATE_3D[state] ?? STATE_3D.unknown;

/** The four-entry legend the stage shows (T-6.5-10). Names come from the shared 2D styles. */
export const LEGEND_3D = [
  { state: "input", label: STATE_STYLE.input.label, glyph: STATE_STYLE.input.glyph },
  { state: "output", label: STATE_STYLE.output.label, glyph: STATE_STYLE.output.glyph },
  { state: "spareSlot", label: "Spare", glyph: STATE_STYLE.wiredSpare.glyph },
  { state: "tq", label: STATE_STYLE.tq.label, glyph: STATE_STYLE.tq.glyph },
];
