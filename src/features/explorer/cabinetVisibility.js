// Pure camera-distance level-of-detail logic for the cabinet/CIOC/baseplate hierarchy, kept free of
// React and three.js so it unit-tests without a WebGL context. `computeLod` is called once per frame
// (throttled by its caller) with the camera's world position and the previous open sets; it returns
// the next open sets using hysteresis so a camera held near a threshold does not flicker.

export const emptyLod = () => ({ cabinets: new Set(), ciocs: new Set(), baseplates: new Set() });

// Thresholds scale with the node's own size (its bounding diagonal), not a shared parent figure, so
// a small baseplate opens only once the camera is genuinely close to it even inside a large cabinet.
// "enter" is the distance that opens a level; "exit" is the (always farther) distance that closes it
// again, so crossing a single boundary cannot flicker.
export function lodThresholds(shape) {
  const diagonal = Math.hypot(...shape.size);
  return { enter: diagonal * 1.8, exit: diagonal * 2.4 };
}

export function withHysteresis(wasOpen, distance, { enter, exit }) {
  return wasOpen ? distance <= exit : distance <= enter;
}

const distanceTo = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * `forced` (same shape as the return value) marks ids that must read as open regardless of camera
 * distance — used to keep a selected TQ's route visible without opening every cabinet.
 */
export function computeLod(dataset, geometry, cameraPosition, previous = emptyLod(), forced = emptyLod()) {
  const next = emptyLod();
  for (const cabinetId of dataset.root.childIds) {
    const shape = geometry.get(cabinetId);
    if (!shape) continue;
    const cabinetOpen = forced.cabinets.has(cabinetId) || withHysteresis(previous.cabinets.has(cabinetId), distanceTo(cameraPosition, shape.position), lodThresholds(shape));
    if (cabinetOpen) next.cabinets.add(cabinetId);
    const cabinet = dataset.nodes.get(cabinetId);
    for (const ciocId of cabinet.childIds) {
      const ciocShape = geometry.get(ciocId);
      const ciocOpen = forced.ciocs.has(ciocId) || (cabinetOpen && withHysteresis(previous.ciocs.has(ciocId), distanceTo(cameraPosition, ciocShape.position), lodThresholds(ciocShape)));
      if (ciocOpen) next.ciocs.add(ciocId);
      for (const plateId of dataset.nodes.get(ciocId).childIds) {
        const plateShape = geometry.get(plateId);
        const plateOpen = forced.baseplates.has(plateId) || (ciocOpen && withHysteresis(previous.baseplates.has(plateId), distanceTo(cameraPosition, plateShape.position), lodThresholds(plateShape)));
        if (plateOpen) next.baseplates.add(plateId);
      }
    }
  }
  return next;
}

export function sameLod(a, b) {
  const setsEqual = (x, y) => x.size === y.size && [...x].every((value) => y.has(value));
  return setsEqual(a.cabinets, b.cabinets) && setsEqual(a.ciocs, b.ciocs) && setsEqual(a.baseplates, b.baseplates);
}

// Every ancestor level of the given position/baseplate/cioc/cabinet node ids, split by type, so a
// selected TQ's route forces open exactly the hierarchy it needs and nothing else.
export function forcedLodFor(dataset, ancestorsOf, nodeIds) {
  const forced = emptyLod();
  for (const nodeId of nodeIds) for (const node of ancestorsOf(dataset, nodeId)) {
    if (node.type === "cabinet") forced.cabinets.add(node.id);
    else if (node.type === "cioc") forced.ciocs.add(node.id);
    else if (node.type === "baseplate") forced.baseplates.add(node.id);
  }
  return forced;
}
