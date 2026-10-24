import { ZONE } from "./layout3d.js";
import { COLOR } from "./stateStyle3d.js";

// The field: where the signals come from. Primitives only, so the scene carries no third-party
// model and no licence question. Greys only; colour in this app means a data state.
const metal = { color: COLOR.steel, roughness: 0.65, metalness: 0.35 };
const dark = { color: COLOR.carbon, roughness: 0.8, metalness: 0.1 };

function Transmitter({ position }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.7, 0.7, 0.5]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, -0.9, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 1.2, 8]} />
        <meshStandardMaterial {...dark} />
      </mesh>
    </group>
  );
}

export default function FieldZone() {
  const x = ZONE.field;
  return (
    <group position={[x, 0, 0]}>
      {/* Storage tank */}
      <mesh position={[0, 3, -2]}>
        <cylinderGeometry args={[2.4, 2.4, 6, 24]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[0, 6.2, -2]}>
        <cylinderGeometry args={[2.4, 2.4, 0.4, 24]} />
        <meshStandardMaterial {...dark} />
      </mesh>

      {/* Pipe run leaving the tank towards the cabinets */}
      <mesh position={[3.2, 1.2, -2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.22, 0.22, 6, 12]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[6, 2.2, -2]}>
        <cylinderGeometry args={[0.22, 0.22, 2.4, 12]} />
        <meshStandardMaterial {...metal} />
      </mesh>

      {/* Pump and its motor */}
      <mesh position={[2.6, 0.5, 2.6]}>
        <boxGeometry args={[1.8, 1, 1.2]} />
        <meshStandardMaterial {...dark} />
      </mesh>
      <mesh position={[2.6, 1.2, 2.6]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.45, 0.45, 1.6, 16]} />
        <meshStandardMaterial {...metal} />
      </mesh>

      {/* Control valve on the line */}
      <mesh position={[5.4, 1.2, 1]}>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial {...metal} />
      </mesh>
      <mesh position={[5.4, 1.9, 1]}>
        <sphereGeometry args={[0.4, 16, 12]} />
        <meshStandardMaterial {...dark} />
      </mesh>

      <Transmitter position={[4, 2.4, 2.2]} />
      <Transmitter position={[1.2, 2.4, 3.6]} />
    </group>
  );
}
