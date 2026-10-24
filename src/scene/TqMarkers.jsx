import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { BP, BP_FACE, CAB, CHARM, framed } from "./layout3d.js";
import { COLOR } from "./stateStyle3d.js";

// A raised TQ shows a ring and a beam on its CHARM, and a dot on every ancestor so it is still
// visible once the camera pulls back. Only the code and one line are shown here: the full card
// lives on the Result page.

function Pulse({ children, still }) {
  const ref = useRef(null);
  useFrame(({ clock }) => {
    if (!ref.current || still) return;
    const s = 1 + Math.sin(clock.elapsedTime * 4) * 0.22;
    ref.current.scale.set(s, s, s);
  });
  return <group ref={ref}>{children}</group>;
}

// Markers sit just in front of the CHARMs, which are mounted on the face of their baseplate.
const FRONT = BP_FACE + CHARM.d + 0.03;

const Dot = ({ position, size }) => (
  <mesh position={position}>
    <sphereGeometry args={[size, 12, 10]} />
    <meshBasicMaterial color={COLOR.tq} />
  </mesh>
);

export default function TqMarkers({ scene, markers, level, target, still, picked, onPick }) {
  return (
    <group>
      {markers.map((m) => {
        const { ref } = m;
        const cabinetCentre = framed(scene, 3, ref).centre;
        const sameCabinet = target.cabinet === ref.cabinet;
        const onThisPlate = sameCabinet && target.cioc === ref.cioc && target.baseplate === ref.baseplate;
        const atCharm = onThisPlate && (level === 6 || (level >= 7 && target.channel === ref.channel));

        return (
          <group key={m.id}>
            {/* Ancestors: cabinet always, then CIOC and baseplate once inside that cabinet. */}
            {level <= 4 && <Dot position={[cabinetCentre[0], CAB.y + CAB.h / 2 + 0.35, 0]} size={0.18} />}
            {sameCabinet && level >= 4 && level < 6 && <Dot position={framed(scene, 5, ref).centre} size={0.07} />}
            {sameCabinet && level >= 5 && <Dot position={[framed(scene, 6, ref).centre[0] - BP.w / 2 - 0.05, framed(scene, 6, ref).centre[1], FRONT]} size={0.022} />}

            {atCharm && m.level >= 6 && (
              <group
                position={[framed(scene, 7, ref).centre[0], framed(scene, 7, ref).centre[1], FRONT]}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick(m);
                }}
              >
                <Pulse still={still}>
                  <mesh>
                    <torusGeometry args={[CHARM.w * 0.95, CHARM.w * 0.14, 8, 24]} />
                    <meshBasicMaterial color={COLOR.tq} />
                  </mesh>
                </Pulse>
                {/* Beam, so the marker is found from outside the baseplate too */}
                <mesh position={[0, 0.5, -CHARM.d / 2]}>
                  <cylinderGeometry args={[CHARM.w * 0.08, CHARM.w * 0.08, 1, 6]} />
                  <meshBasicMaterial color={COLOR.tq} transparent opacity={0.6} />
                </mesh>
                {picked?.id === m.id && (
                  <Html position={[0, 0.2, 0]} center distanceFactor={0.8}>
                    <div className="pointer-events-none whitespace-nowrap rounded-lg border border-data-tq bg-carbon/95 px-2 py-1 text-[11px] text-soft-white">
                      <strong>{m.code}</strong>
                      <span className="ml-2">{m.line}</span>
                    </div>
                  </Html>
                )}
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}
