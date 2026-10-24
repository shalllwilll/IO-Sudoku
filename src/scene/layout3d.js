// Where everything sits in the world, in metres. Pure arithmetic: the meshes and the camera poses
// both read it, so a cabinet drawn here and the pose that frames it can never drift apart.
// Layout follows the reference image: field on the left, marshalling in the centre, control room
// on the right (MI-10).

export const CHANNELS = 12;
export const BASEPLATES_PER_CIOC = 8;
export const CIOCS_PER_CABINET = 4;

export const ZONE = { field: -17, marshalling: 0, control: 17 };

export const CAB = { w: 4, h: 6, d: 2, gap: 1.6, y: 3 };
const CAB_PITCH = CAB.w + CAB.gap;

// A CIOC is a vertical column inside the cabinet; its baseplates stack down it.
export const CIOC = { w: 0.86, h: 5, d: 1.2, y: 3 };
export const BP = { h: 0.52, gap: 0.08, w: CIOC.w - 0.1, d: CIOC.d - 0.2 };
export const CHARM = { w: BP.w / CHANNELS - 0.008, h: BP.h - 0.12, d: 0.3 };
/** Front face of a baseplate: where its CHARMs are mounted. */
export const BP_FACE = BP.d / 2;


/** Centre x of cabinet `index` of `count`, so the row stays centred on the marshalling zone. */
export const cabinetX = (index, count) => ZONE.marshalling + (index - (count - 1) / 2) * CAB_PITCH;

/** Centre x of CIOC `slot` (0 based) within its cabinet. */
export const ciocX = (cabX, slot) => cabX + (slot - (CIOCS_PER_CABINET - 1) / 2) * (CIOC.w + 0.14);

/** Centre y of baseplate `n` (1 based), counted down from the top of the CIOC column. */
export const baseplateY = (n) => CIOC.y + CIOC.h / 2 - (BP.h + BP.gap) * (n - 0.5);

/** Centre x of channel `ch` (1 based) within its baseplate. */
export const channelX = (bpX, ch) => bpX + (ch - (CHANNELS + 1) / 2) * (BP.w / CHANNELS);

/**
 * World centre and half-extents of whatever the camera is looking at: `halfX` across, `halfY` up.
 * They are given separately because the plant is wide and shallow, so framing it as a sphere would
 * leave most of the screen empty. `scene` is the model of sceneModel.js; `target` is the camera
 * machine's focus. Unknown targets fall back to the zone.
 */
export function framed(scene, level, target = {}) {
  const count = scene?.cabinets.length || 1;
  const cab = scene?.cabinets.find((c) => c.no === target.cabinet);
  const index = cab ? scene.cabinets.indexOf(cab) : 0;
  const cabX = cabinetX(index, count);

  if (level <= 1) return { centre: [0, 3, 0], halfX: 27, halfY: 7.5 };
  if (level === 2) return { centre: [ZONE.marshalling, CAB.y, 0], halfX: (count * CAB_PITCH) / 2 + 1, halfY: CAB.h / 2 + 1 };
  if (level === 3) return { centre: [cabX, CAB.y, 0], halfX: CAB.w / 2 + 0.8, halfY: CAB.h / 2 + 0.8 };
  if (level === 4) return { centre: [cabX, CAB.y, 0], halfX: CAB.w / 2 + 0.1, halfY: CAB.h / 2 + 0.1 };

  const slot = cab ? Math.max(0, cab.ciocs.indexOf(target.cioc)) : 0;
  const x = ciocX(cabX, slot);
  if (level === 5) return { centre: [x, CIOC.y, 0], halfX: CIOC.w * 1.6, halfY: CIOC.h / 2 + 0.1 };

  const y = baseplateY(target.baseplate ?? 1);
  if (level === 6) return { centre: [x, y, 0], halfX: BP.w / 2 + 0.08, halfY: BP.h * 1.6 };

  // The chain runs in depth: CHARM on the plate, terminal block behind it, field wiring behind
  // that. The camera looks along it from the side, so its length is what has to fit across.
  return { centre: [channelX(x, target.channel ?? 1), y, BP_FACE + CHARM.d * 1.3], halfX: CHARM.d * 2.3, halfY: CHARM.h * 0.8 };
}
