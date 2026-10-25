import { Edges, Html } from "@react-three/drei";

// Two static schematic structures either side of the cabinets: a field/process area and a control
// room, for orientation only. They hold no workbook data, raise no events, and take no pointer
// input — raycast is switched off on every mesh so they can never be clicked, hovered, or mistaken
// for a hardware position.
const STROKE = "#5e7690";
const BODY = "#2b394a";
const PANEL = "#45586e";
const DIM = "#6f859c";

const NO_RAY = () => null;
const inert = { raycast: NO_RAY };

function Caption({ position, text }) {
  return <Html position={position} center zIndexRange={[5, 0]}><span className="explorer-world-label pointer-events-none site-caption">{text}</span></Html>;
}

// A storage vessel, a pump, an instrument stand and a short pipe run — a schematic process area,
// not a surveyed field layout. Scale is relative to the cabinets' own height.
function FieldStructure({ box }) {
  const [x, , z] = box.position;
  const h = box.size[1];
  const unit = h / 4.6;
  return <group position={[x, 0, z]} scale={unit}>
    <mesh {...inert} position={[-1.1, 1.6, -0.6]}><cylinderGeometry args={[0.55, 0.55, 3.2, 16]} /><meshLambertMaterial color={BODY} /><Edges color={STROKE} /></mesh>
    <mesh {...inert} position={[-1.1, 3.3, -0.6]}><sphereGeometry args={[0.55, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshLambertMaterial color={PANEL} /><Edges color={STROKE} /></mesh>
    <mesh {...inert} position={[-1.1, 0, -0.6]} rotation={[0, 0, 0]}><cylinderGeometry args={[0.6, 0.6, 0.1, 16]} /><meshLambertMaterial color={STROKE} /></mesh>
    <mesh {...inert} position={[0.4, 0.5, 0.4]}><cylinderGeometry args={[0.42, 0.42, 1, 14]} /><meshLambertMaterial color={PANEL} /><Edges color={STROKE} /></mesh>
    <mesh {...inert} position={[0.4, 1.05, 0.4]}><boxGeometry args={[0.32, 0.32, 0.32]} /><meshLambertMaterial color={BODY} /><Edges color={STROKE} /></mesh>
    <mesh {...inert} position={[1.5, 1.9, -0.1]}><cylinderGeometry args={[0.07, 0.07, 1.5, 8]} /><meshLambertMaterial color={DIM} /></mesh>
    <mesh {...inert} position={[1.5, 2.75, -0.1]}><boxGeometry args={[0.5, 0.42, 0.3]} /><meshLambertMaterial color={PANEL} /><Edges color={STROKE} /></mesh>
    <mesh {...inert} position={[1.5, 3.2, -0.1]}><sphereGeometry args={[0.16, 10, 8]} /><meshLambertMaterial color={BODY} /></mesh>
    <mesh {...inert} position={[-0.3, 0.22, 0.9]} rotation={[0, 0, Math.PI / 2]}><cylinderGeometry args={[0.07, 0.07, 1.8, 8]} /><meshLambertMaterial color={DIM} /></mesh>
    <mesh {...inert} position={[0.4, 0.22, 1.5]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.07, 0.07, 1.2, 8]} /><meshLambertMaterial color={DIM} /></mesh>
    <Caption position={[x, h + 0.55, z]} text="Field" />
  </group>;
}

// A controller rack and a three-screen operator desk — a schematic control room, not a surveyed one.
function ControlRoomStructure({ box }) {
  const [x, , z] = box.position;
  const h = box.size[1];
  const unit = h / 4.6;
  return <group position={[x, 0, z]} scale={unit}>
    <mesh {...inert} position={[0.9, 1.8, -0.9]}><boxGeometry args={[1.3, 3.6, 1]} /><meshLambertMaterial color={BODY} /><Edges color={STROKE} /></mesh>
    {[0.7, 1.5, 2.3, 3.1].map((y) => <group key={y}>
      <mesh {...inert} position={[0.9, y, -0.38]}><boxGeometry args={[1.05, 0.5, 0.1]} /><meshLambertMaterial color={PANEL} /><Edges color={STROKE} /></mesh>
      <mesh {...inert} position={[0.9, y, -0.32]}><sphereGeometry args={[0.04, 8, 6]} /><meshLambertMaterial color={DIM} /></mesh>
    </group>)}
    <mesh {...inert} position={[-0.6, 0.55, 0.9]}><boxGeometry args={[2.4, 0.1, 1]} /><meshLambertMaterial color={BODY} /><Edges color={STROKE} /></mesh>
    <mesh {...inert} position={[-1.6, 0.27, 1.3]}><boxGeometry args={[0.08, 0.55, 0.08]} /><meshLambertMaterial color={STROKE} /></mesh>
    <mesh {...inert} position={[0.4, 0.27, 1.3]}><boxGeometry args={[0.08, 0.55, 0.08]} /><meshLambertMaterial color={STROKE} /></mesh>
    {[-1.3, -0.6, 0.1].map((dx) => <group key={dx}>
      <mesh {...inert} position={[dx, 1.1, 0.75]}><boxGeometry args={[0.1, 0.65, 0.65]} /><meshLambertMaterial color={PANEL} /><Edges color={STROKE} /></mesh>
      <mesh {...inert} position={[dx, 0.7, 0.75]}><boxGeometry args={[0.08, 0.12, 0.3]} /><meshLambertMaterial color={DIM} /></mesh>
    </group>)}
    <Caption position={[x, h + 0.55, z]} text="Control room" />
  </group>;
}

export default function SiteStructures({ geometry }) {
  const field = geometry.get("site-field");
  const control = geometry.get("site-control");
  if (!field || !control) return null;
  return <>
    <FieldStructure box={field} />
    <ControlRoomStructure box={control} />
  </>;
}
