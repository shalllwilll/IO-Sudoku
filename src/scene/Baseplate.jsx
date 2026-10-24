import { Html } from "@react-three/drei";
import { BP, BP_FACE, CHARM, baseplateY, channelX } from "./layout3d.js";
import { COLOR, style3d } from "./stateStyle3d.js";
import Tooltip3D from "./Tooltip3D.jsx";
import { useFade } from "./useFade.js";

/** One CHARM position: a module whose height and colour carry its state, plus a direction arrow. */
function Charm({ item, x, y, onEnter, onLeave, onClick, highlighted }) {
  const s = style3d(item.state);
  const h = CHARM.h * s.height;
  return (
    <group position={[x, y - (CHARM.h - h) / 2, BP_FACE + CHARM.d / 2]}>
      <mesh
        onPointerOver={(e) => {
          e.stopPropagation();
          onEnter();
        }}
        onPointerOut={onLeave}
        onClick={(e) => {
          e.stopPropagation();
          onClick();
        }}
      >
        <boxGeometry args={[CHARM.w, h, CHARM.d]} />
        <meshStandardMaterial
          color={s.color}
          emissive={s.color}
          emissiveIntensity={highlighted ? 0.75 : 0.18}
          roughness={0.5}
        />
      </mesh>
      {/* Second cue: an arrow pointing into the cabinet for an input and out of it for an output. */}
      {s.arrow && (
        <mesh
          position={[0, 0, s.arrow === "in" ? CHARM.d * 0.85 : -CHARM.d * 0.85]}
          rotation={[s.arrow === "in" ? -Math.PI / 2 : Math.PI / 2, 0, 0]}
        >
          <coneGeometry args={[CHARM.w * 0.34, CHARM.w * 0.9, 8]} />
          <meshStandardMaterial
            color={s.color}
            emissive={s.color}
            emissiveIntensity={0.4}
          />
        </mesh>
      )}
    </group>
  );
}

/**
 * Level 7: the focused CHARM on its own, with its terminal block and the field wiring named.
 * The three parts are drawn apart so the path from the field cable to the CHARM is readable.
 */
function ChannelDetail({ item, x, y }) {
  const s = style3d(item.state);
  const label = (text, position) => (
    <Html key={text} position={position} center distanceFactor={1.6}>
      <span className="whitespace-nowrap rounded bg-carbon/90 px-1 text-[10px] text-soft-white">
        {text}
      </span>
    </Html>
  );
  return (
    <group position={[x, y, BP_FACE + CHARM.d / 2]}>
      <mesh position={[0, 0, 0.012]}>
        <boxGeometry args={[CHARM.w * 0.9, CHARM.h * 0.9, CHARM.d * 0.9]} />
        <meshStandardMaterial
          color={s.color}
          emissive={s.color}
          emissiveIntensity={0.5}
        />
      </mesh>
      <mesh position={[0, 0, CHARM.d * 1.1]}>
        <boxGeometry args={[CHARM.w * 0.9, CHARM.h * 0.6, CHARM.d * 0.8]} />
        <meshStandardMaterial color={COLOR.steel} roughness={0.6} />
      </mesh>
      {/* Field wiring: the pair arriving from the cable trunk */}
      {[-0.18, 0.18].map((dy) => (
        <mesh
          key={dy}
          position={[0, CHARM.h * dy, CHARM.d * 2.1]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <cylinderGeometry
            args={[CHARM.w * 0.07, CHARM.w * 0.07, CHARM.d * 1.6, 6]}
          />
          <meshStandardMaterial color={COLOR.softWhite} />
        </mesh>
      ))}
      {label("CHARM", [0, CHARM.h * 0.75, 0.012])}
      {label("Terminal block", [0, -CHARM.h * 0.6, CHARM.d * 1.1])}
      {label("Field wiring", [0, CHARM.h * 0.7, CHARM.d * 2.1])}
    </group>
  );
}

/**
 * One baseplate. Its cover fades as the camera enters level 6; the twelve positions only exist for
 * the baseplate in focus, so the scene stays at a few dozen draw calls (see docs/scene-data.md).
 */
export default function Baseplate({
  baseplate,
  x,
  view,
  level,
  focused,
  target,
  hover,
  setHover,
  onEnter,
}) {
  const cover = useFade(view, 6);
  const y = baseplateY(baseplate.n);
  const showPositions = focused && level >= 5;
  const detail = focused && level >= 7 && target.channel;

  return (
    <group>
      <mesh
        position={[x, y, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHover({ cioc: baseplate.cioc_no, baseplate: baseplate.n });
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          e.stopPropagation();
          onEnter({ baseplate: baseplate.n });
        }}
      >
        <boxGeometry args={[BP.w, BP.h, BP.d]} />
        <meshStandardMaterial
          color={baseplate.cabinetSpare ? COLOR.graphite : COLOR.gunmetal}
          roughness={0.85}
        />
      </mesh>

      {showPositions &&
        baseplate.positions
          .filter((item) => level < 7 || item.channel === target.channel)
          .map((item) => (
            <Charm
              key={item.channel}
              item={item}
              x={channelX(x, item.channel)}
              y={y}
              highlighted={
                hover?.channel === item.channel &&
                hover?.baseplate === baseplate.n
              }
              onEnter={() =>
                setHover({
                  cioc: baseplate.cioc_no,
                  baseplate: baseplate.n,
                  channel: item.channel,
                })
              }
              onLeave={() => setHover(null)}
              onClick={() =>
                onEnter({ baseplate: baseplate.n, channel: item.channel })
              }
            />
          ))}

      {/* The cover, drawn after the positions so the transparency sorts correctly (T-6.4-8). */}
      {focused && (
        <mesh
          ref={cover}
          position={[x, y, BP_FACE + CHARM.d + 0.02]}
          renderOrder={2}
        >
          <boxGeometry args={[BP.w, BP.h, 0.01]} />
          <meshStandardMaterial
            color={COLOR.steel}
            transparent
            depthWrite={false}
            opacity={1}
          />
        </mesh>
      )}

      {level === 5 && (
        <Html position={[x - BP.w / 2 - 0.1, y, 0]} center distanceFactor={3}>
          <span className="whitespace-nowrap text-[10px] text-soft-white/80">
            {baseplate.name}
          </span>
        </Html>
      )}

      {detail && (
        <ChannelDetail
          item={baseplate.positions.find((p) => p.channel === target.channel)}
          x={channelX(x, target.channel)}
          y={y}
        />
      )}
      {hover?.channel && hover.baseplate === baseplate.n && showPositions && (
        <Tooltip3D
          position={[
            channelX(x, hover.channel),
            y + BP.h * 0.9,
            BP_FACE + CHARM.d,
          ]}
          item={baseplate.positions.find((p) => p.channel === hover.channel)}
        />
      )}
    </group>
  );
}
