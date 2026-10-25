// Decorative structures either side of the cabinets: a process area on the left, a control room on the
// right. They illustrate the direction of the flow only. They hold no data, take no pointer input, and do
// not stand for any workbook record.
const STROKE = "#9baec2";
const FILL = "#1b2735";
const LANES = [68, 116, 164, 212];

function ProcessArea() {
  return <g fill="none" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round">
    {/* vessel on legs */}
    <path d="M10 62Q10 46 32 46Q54 46 54 62V122Q54 138 32 138Q10 138 10 122Z" fill={FILL} />
    <path d="M10 62Q32 70 54 62M10 122Q32 130 54 122" strokeWidth="1" />
    <path d="M16 136V154M48 136V154M12 154H52" />
    {/* process pipe run */}
    <path d="M54 92H90V196H62" />
    <path d="M90 196H98M8 232H98" strokeWidth="1" />
    {/* transmitter on the pipe */}
    <path d="M76 92V74" />
    <rect x="68" y="56" width="16" height="18" rx="3" fill={FILL} />
    <circle cx="76" cy="50" r="6" fill={FILL} />
    {/* control valve */}
    <path d="M80 138L98 150V138L80 150Z" fill={FILL} />
    <path d="M89 144V128M82 128H96" />
    {/* pump */}
    <circle cx="36" cy="196" r="15" fill={FILL} />
    <path d="M36 181H50M21 196H8" />
    <rect x="22" y="212" width="28" height="8" rx="2" fill={FILL} />
  </g>;
}

function ControlRoom() {
  return <g fill="none" stroke={STROKE} strokeWidth="1.6" strokeLinejoin="round">
    {/* rack tower */}
    <rect x="160" y="30" width="36" height="124" rx="3" fill={FILL} />
    {[38, 64, 90, 116].map((y) => <g key={y}><rect x="165" y={y} width="26" height="20" rx="2" /><circle cx="186" cy={y + 10} r="1.6" fill="#b5cee3" stroke="none" /></g>)}
    {/* operator desk with three displays */}
    {[108, 134, 160].map((x) => <g key={x}><rect x={x} y="172" width="23" height="18" rx="2" fill={FILL} /><path d={`M${x + 4} 180H${x + 19}M${x + 4} 185H${x + 13}`} strokeWidth="1" /><path d={`M${x + 11.5} 190V196M${x + 6} 196H${x + 17}`} /></g>)}
    <rect x="104" y="200" width="94" height="8" rx="2" fill={FILL} />
    <path d="M112 208V250M190 208V250M104 250H198" />
    <path d="M122 198H142M152 198H172" strokeWidth="1" />
  </g>;
}

export default function FlowDiagram({ side, phase }) {
  const field = side === "field";
  const active = field ? ["arrival", "filling"].includes(phase) : ["filling", "outgoing"].includes(phase);
  return <figure className={`flow-side ${active ? "is-flowing" : ""}`} data-phase={phase} aria-label={field ? "Decorative field-side diagram" : "Decorative control-room diagram"}>
    <figcaption>{field ? "FIELD INSTRUMENTS" : "CONTROL ROOM"}</figcaption>
    <svg viewBox="0 0 200 280" role="img" aria-label={field ? "Illustration of process equipment and instruments with cable bundles running toward the cabinets" : "Illustration of cable bundles leaving the cabinets toward the control room"} focusable="false">
      {field ? <ProcessArea /> : <ControlRoom />}
      {LANES.map((y, index) => <g key={y}>
        {[-3, 1, 5].map((offset) => <path key={offset} d={field ? `M104 ${y + offset}H198` : `M2 ${y + offset}H98`} fill="none" stroke="#58758f" strokeWidth="1.2" />)}
        <path d={field ? `M190 ${y - 6}L197 ${y + 1}L190 ${y + 8}` : `M89 ${y - 6}L96 ${y + 1}L89 ${y + 8}`} fill="none" stroke="#b5cee3" />
        {field && <text className="flow-bundle-label" x="108" y={y - 10} fill="#c5d3e1" fontSize="9">{[24, 12, 6, 2][index]}-pair</text>}
        <circle className="flow-pulse" cx={field ? 105 : 3} cy={y + 1} r="2.3" fill="#bfe4ff" style={{ animationDelay: `${-index * 0.17}s` }} />
      </g>)}
    </svg>
    <p>Allocation flow illustration</p>
    <p>{field ? "Sensors & machines" : "Operator stations"}</p>
  </figure>;
}
