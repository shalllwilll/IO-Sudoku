import { useMemo } from "react";
import { BP_FACE, CAB, CHARM, baseplateY, cabinetX, channelX, ciocX, ZONE } from "./layout3d.js";
import { COLOR } from "./stateStyle3d.js";

// Wires are two line objects, not one per signal: one holds a representative wire per CIOC, the
// other whatever the pointer is over. A CIOC with 17 placed positions is still one draw call.

const segments = (pairs) => {
  const array = new Float32Array(pairs.length * 6);
  pairs.forEach(([a, b], i) => array.set([...a, ...b], i * 6));
  return array;
};

/** Where a cable enters the cabinet: the gland plate along its bottom edge. */
const entry = (cabX) => [cabX, CAB.y - CAB.h / 2 + 0.12, CAB.d / 2 - 0.1];

const frontOf = (cabX, slot, bpN, channel) => [channelX(ciocX(cabX, slot), channel), baseplateY(bpN), BP_FACE + CHARM.d * 1.1];

function Lines({ array, color, opacity }) {
  if (array.length === 0) return null;
  return (
    <lineSegments renderOrder={1}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[array, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}

/** Detail wiring inside the cabinet in focus. `hover` is { cioc, baseplate?, channel? } or null. */
export default function Wires({ scene, cabinet, index, count, level, hover }) {
  const cabX = cabinetX(index, count);

  const placed = useMemo(() => {
    const out = [];
    cabinet.ciocs.forEach((no, slot) => {
      const cioc = scene.cioc.get(no);
      if (!cioc) return;
      for (const bp of cioc.baseplates) {
        for (const p of bp.positions) {
          if (p.placement) out.push({ cioc: no, slot, baseplate: bp.n, channel: p.channel, state: p.state });
        }
      }
    });
    return out;
  }, [scene, cabinet]);

  // One wire per CIOC at rest, so the path from field to CHARM is readable without clutter.
  const rest = useMemo(() => {
    const first = new Map();
    for (const w of placed) if (!first.has(w.cioc)) first.set(w.cioc, w);
    return segments([...first.values()].map((w) => [entry(cabX), frontOf(cabX, w.slot, w.baseplate, w.channel)]));
  }, [placed, cabX]);

  const highlight = useMemo(() => {
    if (!hover?.cioc) return new Float32Array(0);
    const wanted = placed.filter(
      (w) =>
        w.cioc === hover.cioc &&
        (hover.baseplate === undefined || w.baseplate === hover.baseplate) &&
        (hover.channel === undefined || w.channel === hover.channel),
    );
    return segments(wanted.map((w) => [entry(cabX), frontOf(cabX, w.slot, w.baseplate, w.channel)]));
  }, [placed, hover, cabX]);

  if (level < 4) return null;
  return (
    <group>
      <Lines array={rest} color={COLOR.steel} opacity={0.55} />
      <Lines array={highlight} color={COLOR.softWhite} opacity={0.85} />
    </group>
  );
}

/** The cable runs between the three zones, visible while the whole plant is in view. */
export function CableRuns({ count }) {
  const array = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < count; i++) {
      const x = cabinetX(i, count);
      pairs.push([[ZONE.field + 6, 1.2, 2], [x, 0.3, 2]]);
      pairs.push([[x, 0.3, 2], [x, CAB.y - CAB.h / 2, 1.2]]);
      pairs.push([[x, CAB.y + CAB.h / 2, -0.6], [ZONE.control - 2, 3.4, -3]]);
    }
    return segments(pairs);
  }, [count]);
  return <Lines array={array} color={COLOR.steel} opacity={0.5} />;
}
