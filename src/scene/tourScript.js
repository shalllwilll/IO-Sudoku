// The demonstration tour: level, dwell time and one line of subtext each. The subtext describes
// only what is on screen. The tour calls the camera machine, so it cannot reach a state the user
// could not reach themselves.
import { LEVELS } from "./cameraMachine.js";

const DWELL = { 1: 3200, 2: 2600, 3: 2600, 4: 3000, 5: 3000, 6: 3200, 7: 3600 };

export const tourSteps = [
  ...LEVELS.map((l) => ({ level: l.level, subtext: l.subtext, dwellMs: DWELL[l.level] })),
  // Rest where it started, so the stage is ready for the next run of the demonstration.
  { level: 1, subtext: LEVELS[0].subtext, dwellMs: 0, last: true },
];

export const tourLength = tourSteps.length;
