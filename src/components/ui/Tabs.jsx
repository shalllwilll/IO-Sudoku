import { useRef } from "react";

// Keyboard pattern: Left and Right move, Home and End jump. Focus follows selection.
export default function Tabs({ tabs, value, onChange, idPrefix = "tabs" }) {
  const refs = useRef({});

  function move(index) {
    const next = tabs[(index + tabs.length) % tabs.length];
    onChange(next.id);
    refs.current[next.id]?.focus();
  }

  function onKeyDown(event, index) {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      move(index + 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      move(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      move(0);
    } else if (event.key === "End") {
      event.preventDefault();
      move(tabs.length - 1);
    }
  }

  return (
    <div role="tablist" className="flex flex-wrap gap-2">
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              refs.current[tab.id] = node;
            }}
            id={`${idPrefix}-${tab.id}-tab`}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={`${idPrefix}-${tab.id}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`focus-ring rounded-full border px-4 py-1.5 text-sm ${
              selected ? "border-soft-white bg-soft-white text-graphite" : "border-steel text-soft-white hover:bg-gunmetal"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
