import { Html } from "@react-three/drei";
import Cioc from "./Cioc.jsx";
import { boxEdges } from "./geometries.js";
import { CAB, cabinetX } from "./layout3d.js";
import { COLOR } from "./stateStyle3d.js";
import { useEdgeFade, useFade } from "./useFade.js";

/**
 * One marshalling cabinet. Its shell fades as the camera enters level 4, revealing the four CIOCs.
 * Only the cabinet in focus builds its interior; the others stay closed boxes.
 *
 * The selection outline is soft-white, never a data colour: cyan already means an input.
 */
export default function Cabinet({ cabinet, index, count, scene, view, level, focused, target, hover, setHover, onEnter }) {
  const shell = useFade(view, 4);
  const edges = useEdgeFade(view, 4);
  const x = cabinetX(index, count);
  const showInterior = focused && level >= 3;

  return (
    <group>
      {showInterior &&
        cabinet.ciocs.map((no, slot) => {
          const cioc = scene.cioc.get(no);
          return cioc ? (
            <Cioc
              key={no}
              cioc={cioc}
              cabX={x}
              slot={slot}
              view={view}
              level={level}
              focused={target.cioc === no}
              target={target}
              hover={hover}
              setHover={setHover}
              onEnter={(wanted) => onEnter({ cabinet: cabinet.no, ...wanted })}
            />
          ) : null;
        })}

      {/* The shell is drawn after the interior, with depth writing off, so nothing flickers. */}
      <mesh
        ref={shell}
        position={[x, CAB.y, 0]}
        renderOrder={5}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover({ cabinet: cabinet.no });
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          onEnter({ cabinet: cabinet.no });
        }}
      >
        <boxGeometry args={[CAB.w, CAB.h, CAB.d]} />
        <meshStandardMaterial color={COLOR.gunmetal} transparent depthWrite={false} opacity={1} roughness={0.7} metalness={0.25} />
      </mesh>

      <lineSegments ref={edges} geometry={boxEdges(CAB.w, CAB.h, CAB.d)} position={[x, CAB.y, 0]} renderOrder={6}>
        <lineBasicMaterial color={focused ? COLOR.softWhite : COLOR.steel} transparent opacity={1} linewidth={1} />
      </lineSegments>

      {level <= 3 && (
        <Html position={[x, CAB.y + CAB.h / 2 + 0.6, 0]} center distanceFactor={16}>
          <span className="whitespace-nowrap rounded bg-carbon/90 px-1.5 py-0.5 text-xs text-soft-white">
            {cabinet.name}
            <span className="ml-1 text-soft-white/60">{cabinet.fillPct}%</span>
          </span>
        </Html>
      )}
    </group>
  );
}
