import { memo } from "react";
import { STATE_STYLE } from "./cellState.js";

// Memoised on state, so one placement event re-renders one cell.
const Cell = memo(function Cell({ state, pos, label, selected, focusable, onSelect, onKeyDown }) {
  const style = STATE_STYLE[state];
  return (
    <button
      type="button"
      data-pos={pos}
      data-state={state}
      aria-label={label}
      aria-pressed={selected}
      tabIndex={focusable ? 0 : -1}
      onClick={(e) => onSelect(pos, e.currentTarget)}
      onKeyDown={onKeyDown}
      style={{ borderStyle: style.outline }}
      className={`focus-ring flex h-[22px] w-[22px] items-center justify-center rounded border text-[10px] leading-none ${style.className} ${
        selected ? "bg-soft-white/20 ring-1 ring-soft-white" : ""
      }`}
    >
      {style.glyph}
    </button>
  );
});

export default Cell;
