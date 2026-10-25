import { useState } from "react";
import { IoTypeBadge, AllocationBadge } from "./IoPresentation.jsx";

export default function RecordTable({ records, onInspect }) {
  const [page, setPage] = useState(0);
  const current = Math.min(page, Math.max(0, Math.ceil(records.length / 50) - 1));
  return <div className="explorer-table-wrap">
    <table className="explorer-table"><caption className="sr-only">Allocation records, available without WebGL</caption>
      <thead><tr><th>Signal / source row</th><th>I/O</th><th>Hardware location</th><th>Allocation</th></tr></thead>
      <tbody>{records.slice(current * 50, current * 50 + 50).map((record) => <tr key={record.id}><td><button type="button" className="underline" onClick={() => onInspect(record.id)}>{record.tag || `Row ${record.sourceRow}`}</button></td><td><IoTypeBadge record={record} /></td><td>{[record.cabinet, record.cioc, record.baseplate, record.channel].filter(Boolean).join(" / ") || "Unplaced"}</td><td><AllocationBadge record={record} /></td></tr>)}</tbody>
    </table>
    <div className="flex items-center justify-between gap-2 p-3 text-xs"><button type="button" className="explorer-button" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous records</button><span>{records.length ? current * 50 + 1 : 0}–{Math.min(records.length, current * 50 + 50)} of {records.length}</span><button type="button" className="explorer-button" disabled={(current + 1) * 50 >= records.length} onClick={() => setPage(current + 1)}>Next records</button></div>
  </div>;
}
