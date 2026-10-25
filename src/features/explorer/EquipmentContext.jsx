import { Html } from "@react-three/drei";
import { useMemo, useState } from "react";
import { combinedBounds } from "./geometry.js";

// These are context markers using supplied identifiers, not surveyed asset models.
export default function EquipmentContext({ dataset, geometry, visibleIds, filteredOnly }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const systems = useMemo(() => {
    const groups = new Map();
    for (const record of dataset.records) {
      const label = record.systemCabinet || record.controller;
      if (!label) continue;
      if (!groups.has(label)) groups.set(label, { label, cabinet: Boolean(record.systemCabinet), controllers: new Set(), recordIds: [] });
      const group = groups.get(label);
      if (record.controller) group.controllers.add(record.controller);
      if (record.active) group.recordIds.push(record.id);
    }
    return [...groups.values()];
  }, [dataset]);
  const bounds = combinedBounds(geometry, dataset.root.childIds);
  const fieldRecords = dataset.records.filter((record) => record.active && record.kind !== "cabinet alarm");
  const fieldCount = fieldRecords.filter((record) => visibleIds.has(record.id)).length;
  const fieldX = bounds.position[0] - bounds.size[0] / 2 - 5;
  const systemX = bounds.position[0] + bounds.size[0] / 2 + 5;
  return <>
    {fieldRecords.length > 0 && (!filteredOnly || fieldCount > 0) && <group position={[fieldX, 1, 1]}>
      <mesh><cylinderGeometry args={[0.12, 0.16, 2, 8]} /><meshLambertMaterial color="#839cb4" /></mesh>
      <mesh position={[0, 1.1, 0]}><sphereGeometry args={[0.4, 12, 8]} /><meshLambertMaterial color="#a5b8c9" /></mesh>
      <Html position={[0, 2.2, 0]} center zIndexRange={[10, 0]}><span className="explorer-world-label pointer-events-none">Field-side signals · {fieldCount}<span className="block text-[9px]">Logical endpoint group</span></span></Html>
    </group>}
    {systems.slice(0, 12).map((system, index) => filteredOnly && !system.recordIds.some((id) => visibleIds.has(id)) ? null : <group key={system.label} position={[systemX, 1.5, -index * 3]} onPointerOver={(event) => { event.stopPropagation(); setHoveredIndex(index); }} onPointerOut={() => setHoveredIndex(null)}>
      <mesh><boxGeometry args={[2, 3, 1.2]} /><meshLambertMaterial color="#465b6e" /></mesh>
      {[0, 1, 2].map((slot) => <mesh key={slot} position={[0, 0.7 - slot * 0.65, 0.65]}><boxGeometry args={[1.6, 0.35, 0.2]} /><meshLambertMaterial color="#98a8b8" /></mesh>)}
    </group>)}
    {systems.length > 0 && (!filteredOnly || systems.some((system) => system.recordIds.some((id) => visibleIds.has(id)))) && <Html position={[systemX, 4.5, 1]} center zIndexRange={[10, 0]}><span className="explorer-world-label pointer-events-none">{systems[hoveredIndex]?.label || `System hardware · ${systems.length} groups`}<span className="block text-[9px]">{systems[hoveredIndex] ? `${systems[hoveredIndex].recordIds.filter((id) => visibleIds.has(id)).length} matching signals` : "Hover a rack for source identifiers"}</span><span className="block text-[9px]">{systems[hoveredIndex] ? [...systems[hoveredIndex].controllers].join(" / ") : "Schematic system-cabinet / controller context"}</span></span></Html>}
    {systems.length > 12 && <Html position={[systemX, 1, -34]} center><span className="explorer-world-label">{systems.length - 12} additional system groups in source records</span></Html>}
  </>;
}
