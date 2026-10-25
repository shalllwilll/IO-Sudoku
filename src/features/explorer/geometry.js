import { recordIo } from "./ioTypes.js";

// A labelled schematic. Dimensions and ordering are presentation choices, not surveyed hardware.
export const OVERVIEW_POSITION_LIMIT = 1000;
export function createGeometry(dataset, { includeContext = true } = {}) {
  const result = new Map();
  const cabinets = dataset.root.childIds.map((id) => dataset.nodes.get(id));
  let cursor = 0;
  for (const cabinet of cabinets) {
    const ciocs = cabinet.childIds.map((id) => dataset.nodes.get(id));
    const maxPlates = Math.max(1, ...ciocs.map((cioc) => cioc.childIds.length));
    const width = Math.max(4, ciocs.length * 3.2 + 0.7);
    const height = Math.max(3, maxPlates * 0.9 + 1.5);
    const x = cursor + width / 2;
    result.set(cabinet.id, { position: [x, height / 2, 0], size: [width, height, 2] });
    ciocs.forEach((cioc, ciocIndex) => {
      const cx = x - width / 2 + 1.95 + ciocIndex * 3.2;
      result.set(cioc.id, { position: [cx, height / 2, 0], size: [3, height - 0.6, 1.1] });
      cioc.childIds.forEach((bpId, bpIndex) => {
        const plate = dataset.nodes.get(bpId);
        const y = height - 1.05 - bpIndex * 0.9;
        const rows = Math.ceil(plate.childIds.length / 12);
        result.set(bpId, { position: [cx, y, 0.65], size: [2.8, Math.max(0.66, rows * 0.4), 0.4] });
        plate.childIds.forEach((positionId, positionIndex) => {
          const columns = Math.min(12, plate.childIds.length);
          const pitch = 2.62 / Math.max(1, columns);
          const slotX = cx + (positionIndex % 12 - (columns - 1) / 2) * pitch;
          const slotY = y + ((rows - 1) / 2 - Math.floor(positionIndex / 12)) * 0.4;
          result.set(positionId, { position: [slotX, slotY, 1.04], size: [Math.min(0.3, pitch * 0.78), 0.36, 0.35] });
        });
      });
    });
    cursor += width + 2.5;
  }
  const offset = Math.max(0, cursor - 2.5) / 2;
  for (const entry of result.values()) entry.position[0] -= offset;
  const maxHeight = Math.max(4, ...cabinets.map((cabinet) => result.get(cabinet.id).size[1]));
  const span = Math.max(6, cursor - 2.5);
  const hasField = includeContext && dataset.records.some((record) => record.active && record.kind !== "cabinet alarm");
  const systems = includeContext ? new Set(dataset.records.map((record) => record.systemCabinet || record.controller).filter(Boolean)).size : 0;
  const minX = -span / 2 - (hasField ? 7 : 1), maxX = span / 2 + (systems ? 7 : 1);
  const minZ = -Math.max(0, Math.min(12, systems) - 1) * 3 - 2;
  result.set("overview", { position: [(minX + maxX) / 2, maxHeight / 2, (minZ + 4) / 2], size: [Math.max(10, maxX - minX), maxHeight + 1, Math.max(8, 4 - minZ)] });
  return result;
}

export function combinedBounds(geometry, ids) {
  const entries = ids.map((id) => geometry.get(id)).filter(Boolean);
  if (!entries.length) return geometry.get("overview");
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const entry of entries) for (let axis = 0; axis < 3; axis++) {
    min[axis] = Math.min(min[axis], entry.position[axis] - entry.size[axis] / 2);
    max[axis] = Math.max(max[axis], entry.position[axis] + entry.size[axis] / 2);
  }
  return { position: min.map((value, axis) => (value + max[axis]) / 2), size: min.map((value, axis) => max[axis] - value) };
}

export function logicalRoute(geometry, dataset, record, index = 0) {
  const slot = geometry.get(record.nodeId);
  if (!slot) return null;
  const cabinet = geometry.get(dataset.nodes.get(dataset.nodes.get(dataset.nodes.get(record.nodeId).parentId).parentId).parentId);
  const cabinetBounds = combinedBounds(geometry, dataset.root.childIds);
  const [x, y, z] = slot.position;
  const field = record.kind === "cabinet alarm" ? [cabinet.position[0], 0.6, 1.4] : [cabinetBounds.position[0] - cabinetBounds.size[0] / 2 - 5, 1 + index * 0.22, 1 + index * 0.15];
  const points = record.kind === "cabinet alarm" ? [field, [cabinet.position[0], y, 1.6], [x, y, 1.6], [x, y, z + 0.22]] : [field, [cabinet.position[0], 0.4, 3.5], [cabinet.position[0], cabinet.size[1] - 0.4, 2.5], [x, cabinet.size[1] - 0.4, 2.1], [x, y, 1.6], [x, y, z + 0.22]];
  return ["AO", "DO"].includes(recordIo(record).code) ? points.reverse() : points;
}
