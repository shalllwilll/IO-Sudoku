// Pure geometry for the one continuous Field → Cabinet(s) → Control-room wire drawn while the
// allocation animation plays (State A). Kept free of three.js/React so the timing math unit-tests
// without a WebGL context.
import { ARRIVAL_MS, FILL_MS, PLAYBACK_MS } from "./allocationPlayback.js";

/**
 * The five-plus-point route: field origin, one point per cabinet in dataset order, control-room
 * destination. Visual only — it explains the direction signals move, not a claim that every signal
 * shares this one physical cable.
 */
export function routePoints(geometry, dataset) {
  const field = geometry.get("site-field"), control = geometry.get("site-control");
  if (!field || !control) return null;
  const cabinetPoints = dataset.root.childIds.map((id) => {
    const shape = geometry.get(id);
    return [shape.position[0], shape.size[1] * 0.6, shape.position[2] - shape.size[2] / 2 - 0.05];
  });
  if (!cabinetPoints.length) return null;
  return [
    [field.position[0] + field.size[0] * 0.32, field.size[1] * 0.5, field.position[2]],
    ...cabinetPoints,
    [control.position[0] - control.size[0] * 0.32, control.size[1] * 0.5, control.position[2]],
  ];
}

/**
 * Maps elapsed playback time to a position 0..1 along `routePoints`' curve. The curve has
 * cabinetCount + 1 segments: field → cabinet 1 during "arrival", cabinet i → cabinet i+1 spread
 * evenly across "filling", and the last cabinet → control room during "outgoing" — the same three
 * phases `allocationFrame` already drives the CHARM-slot reveal from.
 */
export function routeCurveT(elapsedMs, cabinetCount) {
  const segments = Math.max(1, cabinetCount + 1);
  const elapsed = Math.max(0, elapsedMs);
  if (elapsed >= PLAYBACK_MS || cabinetCount <= 0) return 1;
  if (elapsed < ARRIVAL_MS) return elapsed / ARRIVAL_MS / segments;
  if (elapsed < ARRIVAL_MS + FILL_MS) {
    const fillFraction = (elapsed - ARRIVAL_MS) / FILL_MS;
    return (1 + fillFraction * Math.max(0, cabinetCount - 1)) / segments;
  }
  const outFraction = (elapsed - ARRIVAL_MS - FILL_MS) / Math.max(1, PLAYBACK_MS - ARRIVAL_MS - FILL_MS);
  return (cabinetCount + outFraction) / segments;
}
