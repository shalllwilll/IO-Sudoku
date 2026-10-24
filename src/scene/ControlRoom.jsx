import { ZONE } from "./layout3d.js";
import { COLOR } from "./stateStyle3d.js";

// The control room: where the signals end up. Operator consoles and the system cabinet.
const metal = { color: COLOR.steel, roughness: 0.6, metalness: 0.35 };
const dark = { color: COLOR.carbon, roughness: 0.85, metalness: 0.1 };

function Console({ position }) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[2.2, 0.9, 1.1]} />
        <meshStandardMaterial {...dark} />
      </mesh>
      {/* Two screens, tilted back as they stand on the desk */}
      {[-0.55, 0.55].map((dx) => (
        <mesh key={dx} position={[dx, 0.95, -0.1]} rotation={[-0.18, 0, 0]}>
          <boxGeometry args={[1, 0.62, 0.06]} />
          <meshStandardMaterial color={COLOR.gunmetal} emissive={COLOR.steel} emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  );
}

export default function ControlRoom() {
  const x = ZONE.control;
  return (
    <group position={[x, 0, 0]}>
      {/* System cabinet: the controllers the CIOCs report to */}
      <mesh position={[0, 2.6, -3]}>
        <boxGeometry args={[3, 5.2, 1.6]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, 2.6, -2.17]}>
        <boxGeometry args={[2.4, 4.4, 0.06]} />
        <meshStandardMaterial {...dark} />
      </mesh>

      <Console position={[-1.8, 0.45, 2]} />
      <Console position={[1.8, 0.45, 2]} />

      {/* Floor plate, so the room reads as a room */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[9, 10]} />
        <meshStandardMaterial color={COLOR.graphite} roughness={1} />
      </mesh>
    </group>
  );
}
