import { useState } from "react";
import { FIELD_LABELS, mappingProblems, preferredDataSheet, suggestMapping } from "./workbook.js";

export default function ImportPanel({ workbook, onConfirm, onCancel }) {
  const [sheetIndex, setSheetIndex] = useState(() => preferredDataSheet(workbook));
  const [mapping, setMapping] = useState(() => suggestMapping(workbook.sheets[preferredDataSheet(workbook)].headers));
  const sheet = workbook.sheets[sheetIndex];
  const problems = mappingProblems(mapping);
  return (
    <section className="explorer-import" aria-label="Workbook mapping">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Map the workbook</h2>
          <p className="mt-1 text-sm text-soft-white/80">{workbook.name} · {sheet.rows.length.toLocaleString()} rows · header row {sheet.headerRow}</p>
        </div>
        <button className="explorer-button" type="button" onClick={onCancel}>Cancel import</button>
      </div>
      <p className="mt-3 text-sm text-soft-white/80">Review the exact column mappings. A CHARM identifier is not a channel number. Missing hardware stays unplaced; parsing does not validate an engineering allocation.</p>
      <label className="explorer-field mt-4">Worksheet
        <select value={sheetIndex} onChange={(event) => { const index = Number(event.target.value); setSheetIndex(index); setMapping(suggestMapping(workbook.sheets[index].headers)); }}>
          {workbook.sheets.map((item, index) => <option key={item.name} value={index}>{item.name} ({item.rows.length} rows)</option>)}
        </select>
      </label>
      <div className="explorer-mappings mt-4">
        {Object.entries(FIELD_LABELS).map(([field, label]) => (
          <label className="explorer-field" key={field}>{label}
            <select value={mapping[field]} onChange={(event) => setMapping((previous) => ({ ...previous, [field]: event.target.value }))}>
              <option value="">Not available / not mapped</option>
              {sheet.headers.map((header, index) => <option key={index} value={index}>{index + 1}. {header || "(blank header)"}</option>)}
            </select>
          </label>
        ))}
      </div>
      <p className="mt-4 text-sm text-soft-white/80">{mapping.validation === "" ? "No source validation column mapped." : "Mapped validation values are reports from the source workbook."} Application engineering validation has not run. I/O colors describe signal type, not validity.</p>
      {problems.length > 0 && <ul role="alert" className="mt-3 text-sm text-data-tq">{problems.map((problem) => <li key={problem}>{problem}</li>)}</ul>}
      <button type="button" className="explorer-button explorer-button-primary mt-4" disabled={Boolean(problems.length) || !sheet.rows.length} onClick={() => onConfirm(sheet, mapping)}>Load {sheet.rows.length.toLocaleString()} records</button>
    </section>
  );
}
