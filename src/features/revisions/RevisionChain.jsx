import { useRef, useState } from "react";

const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");

/** Rev A → Rev B → Rev C, each node its date and moved-signal count. Arrow-key and Enter selectable. */
export default function RevisionChain({ chain, onSelect }) {
  const refs = useRef({});
  const [focused, setFocused] = useState(chain[0]?.label);

  function move(index, delta) {
    const next = chain[(index + delta + chain.length) % chain.length];
    setFocused(next.label);
    refs.current[next.label]?.focus();
  }

  return (
    <ol aria-label="Revision chain" className="flex flex-wrap items-center gap-1">
      {chain.map((entry, index) => (
        <li key={entry.label} className="flex items-center gap-1">
          {index > 0 && (
            <span className="text-soft-white/40" aria-hidden="true">
              →
            </span>
          )}
          <button
            ref={(node) => {
              refs.current[entry.label] = node;
            }}
            type="button"
            tabIndex={entry.label === focused ? 0 : -1}
            className="focus-ring rounded-xl border border-steel bg-gunmetal px-3 py-2 text-left text-xs hover:bg-steel/40"
            onFocus={() => setFocused(entry.label)}
            onClick={() => onSelect?.(entry)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(index, 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(index, -1);
              }
            }}
          >
            <span className="block font-semibold">Rev {entry.label}</span>
            <span className="block text-soft-white/70">{fmt(entry.created_at)}</span>
            <span className="block text-soft-white/70">{entry.impact ? `${entry.impact.moved} moved` : "baseline"}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
