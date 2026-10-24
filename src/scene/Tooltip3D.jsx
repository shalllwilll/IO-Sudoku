import { Html } from "@react-three/drei";
import { style3d } from "./stateStyle3d.js";

const show = (v) => (v === null || v === undefined || v === "" ? "unknown" : String(v));

/**
 * What a position says when hovered. Every value is rendered as text through React, so a tag
 * containing markup is shown, never interpreted (T-6.5-13).
 *
 * CHARM and terminal-block part numbers are resolved by the backend's hardware stage but are not
 * on the allocation response, so they read "unknown" unless they ride along in `extras`
 * (docs/scene-data.md).
 */
export default function Tooltip3D({ position, item }) {
  const p = item.placement;
  const s = p?.signal ?? {};
  const extras = s.extras ?? {};
  const kind = style3d(item.state);

  const rows = p
    ? [
        ["Tag", p.kind === "wired_spare" ? "none (wired spare)" : show(s.tag)],
        ["Description", show(s.instrument_description)],
        ["IO type", show(item.ioType)],
        ["Signal type", show(s.signal_type)],
        ["CHARM part", show(extras.charm ?? extras.charm_name)],
        ["Terminal block", show(extras.tb ?? extras.tb_name)],
        ["Cable and pair", `${show(s.cable)} · pair ${show(s.pair ?? p.pair)}`],
        ["Status", show(s.status)],
      ]
    : [["State", kind.label]];

  return (
    <Html position={position} center distanceFactor={0.9} zIndexRange={[20, 0]}>
      <div className="pointer-events-none w-56 rounded-xl border border-soft-white/40 bg-carbon/95 p-2 text-[11px] text-soft-white shadow-xl">
        <p className="font-semibold">
          Channel {item.channel} · {kind.label}
        </p>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-soft-white/60">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </Html>
  );
}
