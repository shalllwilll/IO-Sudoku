import { Html } from "@react-three/drei";
import Cabinet from "./Cabinet.jsx";
import CameraRig from "./CameraRig.jsx";
import ControlRoom from "./ControlRoom.jsx";
import FieldZone from "./FieldZone.jsx";
import TqMarkers from "./TqMarkers.jsx";
import Wires, { CableRuns } from "./Wires.jsx";
import { CAB, ZONE } from "./layout3d.js";
import { COLOR } from "./stateStyle3d.js";

const ZONE_LABELS = [
  { x: ZONE.field, text: "Field: sensors and machines" },
  { x: ZONE.marshalling, text: "Marshalling cabinets" },
  { x: ZONE.control, text: "Control room" },
];

/** The whole scene. Everything about the plant comes from `scene`, nothing from this file. */
export default function SceneRoot({
  scene,
  cam,
  view,
  markers,
  hover,
  setHover,
  onEnter,
  picked,
  onPick,
  instant,
}) {
  const count = scene.cabinets.length;
  const focusedIndex = scene.cabinets.findIndex(
    (c) => c.no === cam.target.cabinet,
  );
  const focused = focusedIndex >= 0 ? scene.cabinets[focusedIndex] : null;

  return (
    <>
      <CameraRig scene={scene} cam={cam} view={view} instant={instant} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[10, 16, 12]} intensity={1.15} />
      <directionalLight position={[-12, 8, -10]} intensity={0.4} />

      {/* Ground, so the three zones read as one site rather than floating boxes */}
      <mesh position={[0, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[90, 40]} />
        <meshStandardMaterial color={COLOR.graphite} roughness={1} />
      </mesh>

      <FieldZone />
      <ControlRoom />
      <CableRuns count={count} />

      {/* Once the camera is inside a cabinet the others are only clutter behind it, and a thin
          CIOC column framed by its height leaves most of the screen to its neighbours. */}
      {scene.cabinets.map((cabinet, index) =>
        cam.level >= 5 && cabinet.no !== cam.target.cabinet ? null : (
          <Cabinet
            key={cabinet.no}
            cabinet={cabinet}
            index={index}
            count={count}
            scene={scene}
            view={view}
            level={cam.level}
            focused={cam.target.cabinet === cabinet.no}
            target={cam.target}
            hover={hover}
            setHover={setHover}
            onEnter={onEnter}
          />
        ),
      )}

      {focused && (
        <Wires
          scene={scene}
          cabinet={focused}
          index={focusedIndex}
          count={count}
          level={cam.level}
          hover={hover}
        />
      )}

      <TqMarkers
        scene={scene}
        markers={markers}
        level={cam.level}
        target={cam.target}
        still={instant}
        picked={picked}
        onPick={onPick}
      />

      {cam.level <= 2 &&
        ZONE_LABELS.map((z) => (
          <Html
            key={z.text}
            position={[z.x, CAB.h + 2.4, 0]}
            center
            distanceFactor={26}
          >
            <span className="whitespace-nowrap text-xs uppercase tracking-wide text-soft-white/70">
              {z.text}
            </span>
          </Html>
        ))}
    </>
  );
}
