import { Html } from "@react-three/drei";
import Baseplate from "./Baseplate.jsx";
import { boxEdges } from "./geometries.js";
import { CIOC, ciocX } from "./layout3d.js";
import { ciocLabel } from "./sceneModel.js";
import { COLOR } from "./stateStyle3d.js";
import { useEdgeFade, useFade } from "./useFade.js";

/**
 * One CIOC column. Its shell fades as the camera enters level 5, revealing the eight baseplates.
 * Only the CIOC in focus builds its baseplates; the others stay closed columns.
 */
export default function Cioc({ cioc, cabX, slot, view, level, focused, target, hover, setHover, onEnter }) {
  const shell = useFade(view, 5);
  const edges = useEdgeFade(view, 5);
  const x = ciocX(cabX, slot);
  const showBaseplates = focused && level >= 4;

  return (
    <group>
      {showBaseplates &&
        cioc.baseplates.map((bp) => (
          <Baseplate
            key={bp.n}
            baseplate={{ ...bp, cioc_no: cioc.no }}
            x={x}
            view={view}
            level={level}
            focused={focused && target.baseplate === bp.n}
            target={target}
            hover={hover}
            setHover={setHover}
            onEnter={(wanted) => onEnter({ cioc: cioc.no, ...wanted })}
          />
        ))}

      <mesh
        ref={shell}
        position={[x, CIOC.y, 0]}
        renderOrder={3}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover({ cioc: cioc.no });
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          onEnter({ cioc: cioc.no });
        }}
      >
        <boxGeometry args={[CIOC.w, CIOC.h, CIOC.d]} />
        <meshStandardMaterial color={COLOR.gunmetal} transparent depthWrite={false} opacity={1} roughness={0.7} />
      </mesh>

      <lineSegments ref={edges} geometry={boxEdges(CIOC.w, CIOC.h, CIOC.d)} position={[x, CIOC.y, 0]} renderOrder={4}>
        <lineBasicMaterial color={COLOR.steel} transparent opacity={1} />
      </lineSegments>

      {level === 4 && (
        <Html position={[x, CIOC.y + CIOC.h / 2 + 0.3, 0]} center distanceFactor={6}>
          <span className="whitespace-nowrap rounded bg-carbon/90 px-1 text-[10px] text-soft-white">{ciocLabel(cioc)}</span>
        </Html>
      )}
    </group>
  );
}
