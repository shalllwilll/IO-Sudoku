// The seven-level camera as a pure state machine. No three.js import, so the transitions are unit
// tested without a canvas, and click, wheel, breadcrumb and the tour all drive this one state.

export const LEVELS = [
  { level: 1, name: "Plant", subtext: "Field on the left, marshalling cabinets in the centre, control room on the right." },
  { level: 2, name: "Cabinets", subtext: "The marshalling cabinets that take every field cable." },
  { level: 3, name: "Selected cabinet", subtext: "One cabinet, still closed." },
  { level: 4, name: "Cabinet interior", subtext: "Four CIOCs sit inside each cabinet." },
  { level: 5, name: "CIOC", subtext: "Eight baseplates stack inside a CIOC, BP-1 at the top." },
  { level: 6, name: "Baseplate", subtext: "Twelve CHARM positions across one baseplate." },
  { level: 7, name: "Channel", subtext: "One CHARM: its terminal block and the field wiring." },
];

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 7;

/** Which focus field each level needs before it can be shown. */
const NEEDS = { 3: "cabinet", 4: "cabinet", 5: "cioc", 6: "baseplate", 7: "channel" };

export const initialCameraState = { level: 1, target: {}, deepest: 1 };

const cabinetOf = (scene, no) => scene?.cabinets.find((c) => c.no === no) ?? null;
const ciocOf = (scene, no) => scene?.cioc.get(no) ?? null;

/**
 * Fills in whatever the wanted level needs that the focus does not name yet, taking the first
 * child at each step so a click on a cabinet can walk straight down to a channel.
 * Returns null when the scene cannot supply it, which keeps an invalid target from being entered.
 */
export function resolveTarget(scene, level, wanted = {}) {
  if (!scene || scene.cabinets.length === 0) return level <= 2 ? {} : null;
  const out = {};
  if (level < 3) return out;

  const cab = cabinetOf(scene, wanted.cabinet) ?? scene.cabinets[0];
  if (!cab) return null;
  out.cabinet = cab.no;
  if (level < 5) return out;

  const ciocNo = cab.ciocs.includes(wanted.cioc) ? wanted.cioc : cab.ciocs[0];
  const cioc = ciocOf(scene, ciocNo);
  if (!cioc) return null;
  out.cioc = cioc.no;
  if (level < 6) return out;

  const bp = cioc.baseplates.find((b) => b.n === wanted.baseplate) ?? cioc.baseplates[0];
  if (!bp) return null;
  out.baseplate = bp.n;
  if (level < 7) return out;

  const ch = bp.positions.find((p) => p.channel === wanted.channel) ?? bp.positions[0];
  if (!ch) return null;
  out.channel = ch.channel;
  return out;
}

/** True when `target` names everything levels up to `level` need. */
export function canShow(scene, level, target = {}) {
  if (level < MIN_LEVEL || level > MAX_LEVEL) return false;
  for (const [at, field] of Object.entries(NEEDS)) {
    if (level >= Number(at) && target[field] === undefined) return false;
  }
  return resolveTarget(scene, level, target) !== null;
}

function go(state, scene, level, wanted) {
  if (level < MIN_LEVEL || level > MAX_LEVEL) return state;
  const target = resolveTarget(scene, level, { ...state.target, ...wanted });
  if (target === null) return state; // the scene has no such cabinet, CIOC, baseplate or channel
  return { level, target, deepest: Math.max(state.deepest, level) };
}

/** One level in. `wanted` is what the user clicked, for example { cabinet: 2 } or { channel: 7 }. */
export const enter = (state, scene, wanted = {}) => go(state, scene, state.level + 1, wanted);

/** One level out. The focus keeps its deeper fields so going back in lands where it was. */
export const exit = (state, scene) => (state.level === MIN_LEVEL ? state : go(state, scene, state.level - 1, {}));

/** Straight to a level, used by the breadcrumb and the tour. */
export const jump = (state, scene, level, wanted = {}) => go(state, scene, level, wanted);

/** Breadcrumb entries: every level up to the current one. */
export const trail = (state) => LEVELS.slice(0, state.level);

export const levelInfo = (level) => LEVELS[Math.min(Math.max(level, MIN_LEVEL), MAX_LEVEL) - 1];

/**
 * Wheel handling. Deltas accumulate until they pass a threshold, and a level change then shuts the
 * wheel out until the camera has had time to arrive. Both are needed: the threshold stops a
 * trackpad's small deltas from twitching between levels, and the cooldown stops one quick flick,
 * which arrives as dozens of events, from falling through several levels at once (T-6.3-5).
 *
 * Pure, so `now` is passed in. The caller keeps `memo` and hands it back on the next event.
 */
export const WHEEL_THRESHOLD = 120;
export const WHEEL_COOLDOWN_MS = 700;
export const initialWheel = { accumulated: 0, at: 0 };

export function wheel(state, scene, delta, memo = initialWheel, now = Date.now()) {
  // Still settling after the last change: swallow the rest of the flick.
  if (now - memo.at < WHEEL_COOLDOWN_MS) return { state, memo: { accumulated: 0, at: memo.at } };

  const accumulated = memo.accumulated + delta;
  if (Math.abs(accumulated) < WHEEL_THRESHOLD) return { state, memo: { accumulated, at: memo.at } };

  const next = accumulated < 0 ? enter(state, scene) : exit(state, scene);
  return { state: next, memo: { accumulated: 0, at: now } };
}
