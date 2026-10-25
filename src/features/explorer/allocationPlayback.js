import { isSpareRecord, recordIo } from "./ioTypes.js";

export const PLAYBACK_MS = 6500;
export const ARRIVAL_MS = 600;
export const FILL_MS = 5200;

export function allocationTimeline(dataset) {
  const entries = [], cabinets = [], rank = new Map();
  for (const cabinetId of dataset.root.childIds) {
    const cabinet = dataset.nodes.get(cabinetId), start = entries.length;
    for (const ciocId of cabinet.childIds) for (const plateId of dataset.nodes.get(ciocId).childIds) for (const nodeId of dataset.nodes.get(plateId).childIds) {
      const node = dataset.nodes.get(nodeId);
      const records = node.recordIds.map((id) => dataset.recordMap.get(id));
      const occupied = records.filter((record) => !isSpareRecord(record) || record.kind === "wired spare");
      if (!occupied.length) continue;
      rank.set(nodeId, entries.length);
      entries.push({ nodeId, cabinetId, ciocId, plateId, code: node.io?.code ?? recordIo(occupied[0]).code,
        label: occupied.length === 1 ? occupied[0].tag || node.label : `${occupied.length} conflicting source records`,
        cabinet: cabinet.label, cioc: dataset.nodes.get(ciocId).label, baseplate: dataset.nodes.get(plateId).label, channel: node.channel });
    }
    cabinets.push({ id: cabinetId, label: cabinet.label, start, end: entries.length });
  }
  return { entries, cabinets, rank, durationMs: PLAYBACK_MS };
}

export function allocationFrame(timeline, elapsedMs) {
  const elapsed = Math.max(0, elapsedMs), total = timeline.entries.length;
  if (elapsed >= PLAYBACK_MS) return { phase: "complete", running: false, progress: 100, revealed: total, activeCabinetId: null, current: null, batchStart: total };
  if (elapsed < ARRIVAL_MS) return { phase: "arrival", running: true, progress: elapsed / PLAYBACK_MS * 100, revealed: 0, activeCabinetId: null, current: null, batchStart: 0 };
  if (elapsed >= ARRIVAL_MS + FILL_MS || !timeline.cabinets.length) return { phase: "outgoing", running: true, progress: elapsed / PLAYBACK_MS * 100, revealed: total, activeCabinetId: null, current: null, batchStart: total };
  const part = (elapsed - ARRIVAL_MS) / FILL_MS * timeline.cabinets.length;
  const index = Math.min(timeline.cabinets.length - 1, Math.floor(part)), cabinet = timeline.cabinets[index];
  const revealed = cabinet.start + Math.min(cabinet.end - cabinet.start, Math.floor((part - index) * (cabinet.end - cabinet.start)) + 1);
  // A small moving batch gets a separate outline. The source color/status is never changed.
  const batchSize = Math.max(1, Math.ceil((cabinet.end - cabinet.start) / Math.max(1, FILL_MS / timeline.cabinets.length / 100)));
  return { phase: "filling", running: true, progress: elapsed / PLAYBACK_MS * 100, revealed, activeCabinetId: cabinet.id,
    current: cabinet.end > cabinet.start ? timeline.entries[Math.max(cabinet.start, revealed - 1)] : null, batchStart: Math.max(cabinet.start, revealed - batchSize) };
}

export function createAllocationPlayback(dataset, { reducedMotion = false, now = performance.now() } = {}) {
  const timeline = allocationTimeline(dataset);
  const playback = { timeline, current: allocationFrame(timeline, reducedMotion ? PLAYBACK_MS : 0), cancelled: false,
    advance(time) { if (this.current.running) this.current = allocationFrame(timeline, time - now); return this.current; },
    cancel() { this.cancelled = true; this.current = allocationFrame(timeline, PLAYBACK_MS); return this.current; },
  };
  return playback;
}

export function recordHasTq(dataset, record) {
  return record.issueIds.some((id) => dataset.issues.find((issue) => issue.id === id)?.kind === "tq");
}

export function inspectionRecords(dataset, { ioType = "", tq = "all" } = {}) {
  return dataset.records.filter((record) => {
    if (ioType && recordIo(record).code !== ioType) return false;
    const hasTq = recordHasTq(dataset, record);
    return tq === "all" || (tq === "raised" ? hasTq : !hasTq);
  });
}

export function slotBrightness(node, dataset, visibleIds, playback) {
  const rank = playback?.timeline.rank.get(node.id);
  if (playback?.current.running && rank !== undefined && rank >= playback.current.revealed) return 0.08;
  const spare = node.io?.code === "SPARE" || (!node.recordIds.length || node.recordIds.every((id) => isSpareRecord(dataset.recordMap.get(id))));
  return spare || node.recordIds.some((id) => visibleIds.has(id)) ? 1 : 0.12;
}
