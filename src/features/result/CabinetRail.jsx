// All cabinets as summary tiles: name and fill percentage. Full detail is drawn only for the selected one.
export default function CabinetRail({ cabinets, selected, onSelect }) {
  return (
    <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Cabinets">
      {cabinets.map((cab) => (
        <li key={cab.no}>
          <button
            type="button"
            aria-pressed={cab.no === selected}
            onClick={() => onSelect(cab.no)}
            className={`focus-ring rounded-xl border px-3 py-2 text-left text-xs ${
              cab.no === selected ? "border-soft-white bg-gunmetal" : "border-steel hover:bg-gunmetal"
            }`}
          >
            <span className="block font-semibold">{cab.name}</span>
            <span className="text-soft-white/70">{cab.fillPct}% full</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
