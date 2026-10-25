import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { routeCurveT, routePoints } from "./allocationRoute.js";
import { PLAYBACK_MS } from "./allocationPlayback.js";

// State A only: one continuous wire from the field structure, through every cabinet in order, to the
// control room, with a pulse that advances as the allocation animation plays. It is an explanation of
// the direction signals move through the system, not a claim that every signal shares one cable.
export default function AllocationRoute({ geometry, dataset, reveal, reducedMotion }) {
  const points = useMemo(() => routePoints(geometry, dataset), [geometry, dataset]);
  const cabinetCount = dataset.root.childIds.length;
  const curve = useMemo(() => (points && points.length >= 2 ? new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, "centripetal") : null), [points]);
  const sampled = useMemo(() => (curve ? curve.getPoints(140) : []), [curve]);
  const pulse = useRef(null);
  useFrame(() => {
    if (!curve || !reveal || !pulse.current) return;
    const frame = reveal.current;
    const elapsedMs = PLAYBACK_MS * (Math.min(100, Math.max(0, frame.progress)) / 100);
    const t = Math.min(1, Math.max(0, routeCurveT(elapsedMs, cabinetCount)));
    pulse.current.position.copy(curve.getPoint(t));
  });
  if (!curve || !sampled.length) return null;
  return <group>
    <Line points={sampled} color="#bfe4ff" lineWidth={2.4} transparent opacity={0.85} />
    {!reducedMotion && <mesh ref={pulse} raycast={() => null}><sphereGeometry args={[0.16, 12, 8]} /><meshBasicMaterial color="#ffffff" toneMapped={false} /></mesh>}
  </group>;
}
