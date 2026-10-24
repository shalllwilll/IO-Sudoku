// Turns a run's layout and allocation into the 3D scene: every cabinet, CIOC, baseplate and
// position, with its state and the indexes the TQ lookup needs.
//
// The playbook's M6.1 built this from the sample workbook with a build-time script. It is built
// from the run data instead, because the dataset workbooks must never be committed and the same
// code then works against a real run (see docs/scene-data.md). Names and counts still come only
// from the data; nothing about the plant is hard-coded here.
import { ioTypeOf, PLACEMENT_KIND, signalKey } from "../api/live/wire.js";
import { cellState } from "../features/result/cellState.js";
import { normaliseTag } from "../lib/tagKey.js";
import { CHANNELS } from "./layout3d.js";

const commonest = (values) => {
  const counts = new Map();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0]?.[0] ?? null;
};

/** `layoutOut` and `allocation` are the API responses; `tqs` the run's TQ list. */
export function buildScene(layoutOut, allocation, tqs = []) {
  const layout = layoutOut.layout;
  const placements = allocation.placements ?? [];

  const at = new Map();
  for (const p of placements) at.set(`${p.cioc_no}:${p.baseplate}:${p.channel}`, p);

  const openTqKeys = new Set();
  for (const tq of tqs) {
    if (tq.status === "answered") continue;
    for (const key of tq.signal_keys ?? []) openTqKeys.add(key);
  }
  const hasTq = (p) => Boolean(p?.signal) && openTqKeys.has(signalKey(p.signal.source_file, p.signal.source_row));

  const byState = {};
  const tagIndex = new Map();
  const keyIndex = new Map(); // "<source file>:<source row>" as the backend writes it in signal_keys
  const cableIndex = new Map();
  const pairIndex = new Map();
  const cioc = new Map();

  for (const c of layout.ciocs) {
    const own = placements.filter((p) => p.cioc_no === c.no);
    const baseplates = c.baseplates.map((bp) => {
      const reserved = Boolean(bp.reserved);
      const held = own.filter((p) => p.baseplate === bp.n);
      const positions = Array.from({ length: CHANNELS }, (_, i) => {
        const channel = i + 1;
        const placement = at.get(`${c.no}:${bp.n}:${channel}`) ?? null;
        const state = cellState({ placement, baseplateUsed: held.length > 0, reserved, hasTq: hasTq(placement) });
        byState[state] = (byState[state] ?? 0) + 1;

        const ref = { cabinet: c.cabinet, cioc: c.no, baseplate: bp.n, channel };
        const tag = placement?.signal?.tag;
        if (tag) tagIndex.set(normaliseTag(tag), ref);
        if (placement?.signal) keyIndex.set(signalKey(placement.signal.source_file, placement.signal.source_row), ref);
        const cable = placement?.signal?.cable ?? null;
        const pair = placement?.signal?.pair ?? placement?.pair ?? null;
        if (cable) {
          if (!cableIndex.has(cable)) cableIndex.set(cable, []);
          cableIndex.get(cable).push(ref);
          const key = `${normaliseTag(cable)}|${pair ?? ""}`;
          if (pair !== null && !pairIndex.has(key)) pairIndex.set(key, ref);
        }
        return { channel, placement, state, ref, ioType: ioTypeOf(placement) };
      });
      return {
        ...bp,
        reserved,
        used: held.length > 0,
        // A baseplate nothing was placed on is a whole cabinet spare, which reads differently
        // from a free position next to a placed signal.
        cabinetSpare: held.length === 0 && !reserved,
        positions,
      };
    });

    cioc.set(c.no, {
      ...c,
      baseplates,
      group: commonest(own.map((p) => p.group)),
      segregation: commonest(own.map((p) => p.signal?.segregation_family ?? p.signal?.segregation)),
      occupied: own.length,
      signals: own.filter((p) => p.kind !== PLACEMENT_KIND.wiredSpare).length,
    });
  }

  const cabinets = layout.cabinets.map((cab) => {
    const own = placements.filter((p) => cab.ciocs.includes(p.cioc_no));
    const positions = cab.ciocs.reduce((n, no) => n + (cioc.get(no)?.baseplates.length ?? 0) * CHANNELS, 0);
    return { ...cab, occupied: own.length, positions, fillPct: positions ? Math.round((own.length / positions) * 100) : 0 };
  });

  return {
    cabinets,
    cioc,
    tagIndex,
    keyIndex,
    cableIndex,
    pairIndex,
    counts: {
      cabinets: cabinets.length,
      ciocs: layout.ciocs.length,
      baseplates: layout.ciocs.reduce((n, c) => n + c.baseplates.length, 0),
      positions: layout.ciocs.reduce((n, c) => n + c.baseplates.length, 0) * CHANNELS,
      placements: placements.length,
      byState,
    },
  };
}

/** The CIOC label the playbook asks for: name, affinity group and segregation family, from the data. */
export const ciocLabel = (c) => [c.name, c.group, c.segregation].filter(Boolean).join(" · ");

/** The baseplate and its position for a focus target, or null. */
export function positionAt(scene, { cioc: no, baseplate, channel }) {
  const bp = scene.cioc.get(no)?.baseplates.find((b) => b.n === baseplate);
  return bp?.positions.find((p) => p.channel === channel) ?? null;
}
