// Camera poses and the tween between them. Pure maths, so the rig only applies the result and the
// curve can be checked in a unit test.
import { framed } from "./layout3d.js";

export const FOV = 40;

const RAD = Math.PI / 180;

/**
 * The pose that frames `level` and `target`: back far enough that the subject fills the view in
 * whichever direction is tighter, so a wide plant fills the width and a tall cabinet the height.
 */
export function poseFor(scene, level, target = {}, aspect = 16 / 9) {
  const { centre, halfX, halfY } = framed(scene, level, target);
  const half = Math.tan((FOV / 2) * RAD);
  const distance = (Math.max(halfY, halfX / Math.max(aspect, 0.2)) / half) * 1.08;
  // Looking down at the wide levels, and a little down at the deep ones: dead-on, a CHARM is a
  // flat rectangle and its direction arrow points straight at the camera, so neither reads.
  const lift = level <= 2 ? halfY * 0.5 : level <= 4 ? halfY * 0.12 : halfY * 0.45;
  // Levels 1 to 6 look at the front of the cabinets. Level 7 swings round to the side, because
  // its subject lies in depth and would otherwise be hidden behind the CHARM facing the camera.
  if (level >= 7) {
    return {
      position: [centre[0] + distance * 0.8, centre[1] + distance * 0.26, centre[2] + distance * 0.54],
      lookAt: centre,
      fov: FOV,
    };
  }
  return { position: [centre[0], centre[1] + lift, centre[2] + distance], lookAt: centre, fov: FOV };
}

export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const mix = (a, b, t) => a + (b - a) * t;
const vec = (a, b, t) => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];
const span = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

/**
 * Pose at progress `t` (0 to 1) of a move. The path bows upwards a little so a long move reads as
 * travel rather than a cut; the bow is a fraction of the distance, so short moves stay straight.
 */
export function tweenPose(from, to, t) {
  const e = easeInOut(Math.min(1, Math.max(0, t)));
  const position = vec(from.position, to.position, e);
  const arc = Math.min(span(from.position, to.position) * 0.06, 2.5);
  position[1] += Math.sin(Math.PI * e) * arc;
  return { position, lookAt: vec(from.lookAt, to.lookAt, e), fov: mix(from.fov, to.fov, e) };
}

/**
 * Where the camera is between two levels, as a fraction: 3.4 means "two fifths of the way from the
 * closed cabinet into its interior". Fades read from this, so a fade interrupted half way
 * continues from the value it had, and the wheel and a click give the same curve.
 */
export const effectiveLevel = (fromLevel, toLevel, t) => mix(fromLevel, toLevel, easeInOut(Math.min(1, Math.max(0, t))));

/**
 * How solid a shell is. `fadeAt` is the level at which it has gone: 4 for a cabinet shell (level 3
 * shows it closed, level 4 shows the CIOCs inside), 5 for a CIOC, 6 for a baseplate cover, 7 for a
 * CHARM housing. Edge lines stay drawn at 0 so the shape is still read.
 */
export const shellOpacity = (fadeAt, atLevel) => Math.min(1, Math.max(0, fadeAt - atLevel));
