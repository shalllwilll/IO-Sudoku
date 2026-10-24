import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { brief, stateLabel } from "./brief.js";
import { aggregate } from "./resultModel.js";

const show = (v) => (v === null || v === undefined || v === "" ? "unknown" : String(v));

/** Turns a selection into the rows shown in the box. Every value is rendered as text. */
export function describeSelection(model, sel) {
  if (sel.kind === "cell") {
    const [cNo, bpN, ch] = sel.key.split(":").map(Number);
    const cioc = model.cioc.get(cNo);
    const bp = cioc.baseplates.find((b) => b.n === bpN);
    const p = model.byPosition.get(sel.key) ?? null;
    const s = p?.signal ?? {};
    const present = sel.state !== "spareSlot" && sel.state !== "emptyBaseplate" && sel.state !== "reservedAlarm";
    return {
      title: `${cioc.name} · ${bp.name} · channel ${ch}`,
      state: stateLabel(sel.state),
      origin: present
        ? [["Source file", show(s.source_file)], ["Row", show(s.source_row)], ["Cable", show(s.cable ?? p?.cable)], ["Pair", show(s.pair ?? p?.pair)], ["Area", show(s.area)]]
        : [],
      signal: present
        ? [["Tag", show(s.tag)], ["Description", show(s.instrument_description)], ["IO type", show(p?.io_type)], ["Signal type", show(s.signal_type)], ["CHARM part", show(s.charm_part)], ["Terminal block part", show(s.terminal_block_part)], ["Status", show(s.status)]]
        : [],
      brief: brief({ kind: "cell", state: sel.state, placement: p && { ...p, cable: p.cable }, ciocName: cioc.name, bpName: bp.name, channel: ch }),
    };
  }
  if (sel.kind === "baseplate") {
    const cioc = model.cioc.get(sel.cioc);
    const bp = cioc.baseplates.find((b) => b.n === sel.bp);
    const counts = aggregate(model, { ciocs: [sel.cioc], baseplate: sel.bp });
    return { title: bp.name, state: "Baseplate", origin: [], signal: Object.entries(counts).map(([k, v]) => [k, v]), brief: brief({ kind: "baseplate", name: bp.name, ciocName: cioc.name, ...counts }) };
  }
  if (sel.kind === "cioc") {
    const cioc = model.cioc.get(sel.no);
    const cab = model.layout.cabinets.find((c) => c.no === cioc.cabinet);
    const counts = aggregate(model, { ciocs: [sel.no] });
    return { title: cioc.name, state: "CIOC", origin: [], signal: Object.entries(counts).map(([k, v]) => [k, v]), brief: brief({ kind: "cioc", name: cioc.name, cabinetName: cab.name, ...counts }) };
  }
  const cab = model.perCabinet.find((c) => c.no === sel.no);
  const counts = aggregate(model, { ciocs: cab.ciocs });
  return { title: cab.name, state: "Cabinet", origin: [], signal: Object.entries(counts).map(([k, v]) => [k, v]), brief: brief({ kind: "cabinet", name: cab.name, fillPct: cab.fillPct, ...counts }) };
}

function Rows({ title, rows }) {
  if (rows.length === 0) return null;
  return (
      <section className="mt-2">
        <h4 className="text-[10px] uppercase text-soft-white/60">{title}</h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-soft-white/70">{k}</dt>
              <dd className="break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
  );
}

const WIDTH = 300;

/** Floating box next to the clicked item. Flips when it would leave the viewport. */
export default function InfoBox({ info, anchor, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const height = ref.current?.offsetHeight ?? 260;
    let left = rect.right + 8;
    if (left + WIDTH > window.innerWidth - 8) left = Math.max(8, rect.left - WIDTH - 8);
    const top = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - height - 8));
    setPos({ left, top });
  }, [anchor, info]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [onClose]);

  return (
    <aside
      ref={ref}
      role="dialog"
      aria-label={`Details for ${info.title}`}
      style={{ left: pos.left, top: pos.top, width: WIDTH }}
      className="fixed z-30 rounded-panel border border-soft-white/40 bg-carbon p-4 shadow-xl"
    >
      <header className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{info.title}</h3>
          <p className="text-xs text-soft-white/70">{info.state}</p>
        </div>
        <button type="button" className="focus-ring rounded px-1" aria-label="Close details" onClick={onClose}>
          ×
        </button>
      </header>
      <Rows title="Origin" rows={info.origin} />
      <Rows title="Signal" rows={info.signal} />
      <section className="mt-2">
        <h4 className="text-[10px] uppercase text-soft-white/60">Brief</h4>
        <p className="text-xs">{info.brief}</p>
      </section>
    </aside>
  );
}
