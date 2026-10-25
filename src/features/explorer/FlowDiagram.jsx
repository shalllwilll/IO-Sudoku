export default function FlowDiagram({ side, phase }) {
  const field = side === "field";
  const active = field ? ["arrival", "filling"].includes(phase) : ["filling", "outgoing"].includes(phase);
  return <figure className={`flow-side ${active ? "is-flowing" : ""}`} data-phase={phase} aria-label={field ? "Decorative field-side diagram" : "Decorative control-room diagram"}>
    <figcaption>{field ? "FIELD INSTRUMENTS" : "CONTROL ROOM"}</figcaption>
    <svg viewBox="0 0 160 280" role="img" aria-label={field ? "Illustration of instruments and parallel cable bundles flowing toward the cabinets" : "Illustration of signals leaving the cabinets toward the control system"} focusable="false">
      {field ? <g fill="none" stroke="#9baec2" strokeWidth="2">
        <path d="M8 45H38M23 45V75M8 115H38M23 115V140M8 185H38M23 185V215" />
        <circle cx="23" cy="30" r="14" /><path d="M12 20L34 40M12 40L34 20" />
        <rect x="11" y="88" width="24" height="22" rx="3" /><path d="M15 105L31 92" />
        <path d="M10 153L36 177V153L10 177ZM23 153V140H34" />
        <path d="M38 30H47V68H62M38 100H50V116H62M38 166H48V164H62M23 215H62" />
      </g> : <g fill="none" stroke="#9baec2" strokeWidth="2">
        <rect x="96" y="30" width="56" height="164" rx="5" />
        {[48, 75, 102, 129].map((y) => <g key={y}><rect x="103" y={y} width="42" height="18" rx="2" /><circle cx="138" cy={y + 9} r="2" fill="#b5cee3" /></g>)}
        <rect x="87" y="215" width="64" height="36" rx="3" /><path d="M119 251V261M104 262H134" />
      </g>}
      {[68, 116, 164, 212].map((y, index) => <g key={y}>
        {[-3, 1, 5].map((offset) => <path key={offset} d={field ? `M60 ${y + offset}H158` : `M2 ${y + offset}H96`} fill="none" stroke="#58758f" strokeWidth="1.2" />)}
        <path d={field ? `M150 ${y - 6}L157 ${y + 1}L150 ${y + 8}` : `M87 ${y - 6}L94 ${y + 1}L87 ${y + 8}`} fill="none" stroke="#b5cee3" />
        {field && <text className="flow-bundle-label" x="65" y={y - 10} fill="#c5d3e1" fontSize="9">{[24, 12, 6, 2][index]}-pair</text>}
        <circle className="flow-pulse" cx={field ? 61 : 3} cy={y + 1} r="2.3" fill="#bfe4ff" style={{ animationDelay: `${-index * 0.17}s` }} />
      </g>)}
    </svg>
    <p>Allocation flow illustration</p>
  </figure>;
}
