import { useCallback, useState } from "react";
import Cell from "./Cell.jsx";
import { cellState, STATE_STYLE } from "./cellState.js";
import { CHANNELS, isTq, posKey } from "./resultModel.js";

/**
 * Selected cabinet: its CIOC columns, each with one row per baseplate of 12 cells.
 * Layout lives only here (MI-7). visibleCount limits placements for the replay.
 */
export default function CabinetGrid({ model, cabinetNo, visibleCount = Infinity, selectedKey, highlightKeys, onSelect }) {
  const cabinet = model.layout.cabinets.find((c) => c.no === cabinetNo);
  const [focusKey, setFocusKey] = useState(null);

  const move = useCallback((event) => {
    const [cioc, bp, ch] = event.currentTarget.dataset.pos.split(":").map(Number);
    let next = null;
    if (event.key === "ArrowRight") next = [cioc, bp, ch + 1];
    else if (event.key === "ArrowLeft") next = [cioc, bp, ch - 1];
    else if (event.key === "ArrowDown") next = [cioc, bp + 1, ch];
    else if (event.key === "ArrowUp") next = [cioc, bp - 1, ch];
    else if (event.key === "Home") next = [cioc, bp, 1];
    else if (event.key === "End") next = [cioc, bp, CHANNELS];
    if (!next) return;
    event.preventDefault();
    const key = posKey(...next);
    const node = event.currentTarget.closest("[data-grid]")?.querySelector(`[data-pos="${key}"]`);
    if (node) {
      setFocusKey(key);
      node.focus();
    }
  }, []);

  if (!cabinet) return null;
  const first = cabinet.ciocs[0] && model.cioc.get(cabinet.ciocs[0]);
  const defaultKey = first ? posKey(first.no, first.baseplates[0]?.n ?? 1, 1) : null;
  const activeKey = focusKey ?? defaultKey;

  return (
    <div data-grid className="grid gap-3" style={{ gridTemplateColumns: `repeat(${cabinet.ciocs.length}, minmax(0, 1fr))` }}>
      {cabinet.ciocs.map((no) => {
        const cioc = model.cioc.get(no);
        return (
          <section key={no} aria-label={cioc.name} className="rounded-xl border border-steel p-2">
            <button
              type="button"
              className="focus-ring mb-2 w-full rounded-full bg-gunmetal px-2 py-1 text-xs font-semibold"
              onClick={(e) => onSelect({ kind: "cioc", no }, e.currentTarget)}
            >
              {cioc.name}
            </button>
            <div className="space-y-1">
              {cioc.baseplates.map((bp) => (
                <div key={bp.n} className="flex items-center gap-1">
                  <button
                    type="button"
                    className="focus-ring w-8 shrink-0 text-left text-[10px] text-soft-white/70 hover:underline"
                    onClick={(e) => onSelect({ kind: "baseplate", cioc: no, bp: bp.n }, e.currentTarget)}
                  >
                    {bp.name}
                  </button>
                  <div className="flex flex-wrap gap-[2px]">
                    {Array.from({ length: CHANNELS }, (_, i) => {
                      const ch = i + 1;
                      const key = posKey(no, bp.n, ch);
                      const raw = model.byPosition.get(key);
                      const visible = raw && model.order.get(key) < visibleCount;
                      const placement = visible ? raw : null;
                      const state = cellState({
                        placement,
                        baseplateUsed: model.usedBaseplates.has(`${no}:${bp.n}`),
                        reserved: Boolean(bp.reserved),
                        hasTq: placement ? isTq(model, placement) : false,
                      });
                      return (
                        <Cell
                          key={key}
                          pos={key}
                          state={state}
                          label={`${cioc.name} ${bp.name} channel ${ch}: ${STATE_STYLE[state].label}`}
                          selected={selectedKey === key}
                          highlighted={highlightKeys?.has(key)}
                          focusable={activeKey === key}
                          onSelect={(pos, node) => {
                            setFocusKey(pos);
                            onSelect({ kind: "cell", key: pos, state }, node);
                          }}
                          onKeyDown={move}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
