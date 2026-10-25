import { Html, Line } from "@react-three/drei";
import { useMemo } from "react";
import { CatmullRomCurve3, Vector3 } from "three";
import { fullSignalRoute } from "./geometry.js";

// State B's selected-issue overlay: one bright, prominent line from the field side through the
// affected CHARM to the control room, for the TQ or error currently selected. Nothing else dims or
// hides — the zoom-based LOD controller forces that CHARM's cabinet/CIOC/baseplate open separately,
// so this component only has to draw the line and the on-canvas issue summary.
export default function TqRouteHighlight({ dataset, geometry, issue }) {
  const route = useMemo(() => {
    if (!issue) return null;
    const recordId = issue.recordIds.find((id) => dataset.recordMap.get(id)?.nodeId) ?? issue.recordIds[0];
    const record = recordId && dataset.recordMap.get(recordId);
    if (!record) return null;
    const points = fullSignalRoute(geometry, dataset, record);
    if (!points) return null;
    const curve = new CatmullRomCurve3(points.map((point) => new Vector3(...point)), false, "centripetal");
    return { record, points: curve.getPoints(100) };
  }, [issue, dataset, geometry]);
  if (!route) return null;
  const color = issue.severity === "error" ? "#ff767e" : "#ffc46b";
  return <group>
    <Line points={route.points} color={color} lineWidth={3.2} transparent opacity={0.95} />
    <Html position={route.points[route.points.length - 1]} center zIndexRange={[12, 0]}>
      <span className="explorer-world-label pointer-events-none" style={{ borderColor: color }}>
        {issue.kind === "tq" ? `TQ ${issue.reference}` : issue.reference} · {issue.severity}{issue.status ? ` · ${issue.status}` : ""}
        <span className="block text-[9px] text-soft-white/80">{route.record.tag || `Row ${route.record.sourceRow}`}</span>
      </span>
    </Html>
  </group>;
}
