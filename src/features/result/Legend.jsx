import { useState } from "react";
import { STATE_STYLE } from "./cellState.js";

const SHOWN = ["input", "output", "spareSlot", "wiredSpare", "reservedAlarm", "emptyBaseplate", "tq"];

export default function Legend() {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-panel border border-steel p-3 text-xs">
      <button type="button" className="focus-ring font-semibold" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Legend {open ? "−" : "+"}
      </button>
      {open && (
        <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
          {SHOWN.map((key) => (
            <li key={key} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                style={{ borderStyle: STATE_STYLE[key].outline }}
                className={`flex h-4 w-4 items-center justify-center rounded border text-[9px] ${STATE_STYLE[key].className}`}
              >
                {STATE_STYLE[key].glyph}
              </span>
              {STATE_STYLE[key].label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
