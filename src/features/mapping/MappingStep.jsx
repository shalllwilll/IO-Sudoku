import { useCallback, useEffect, useState } from "react";
import { api } from "../../api/index.js";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import Tabs from "../../components/ui/Tabs.jsx";
import {
  FIELD_LABELS,
  IGNORE,
  columnLabel,
  confidenceLevel,
  initialAssignments,
  isValid,
  percent,
  validateAssignments,
} from "./mappingState.js";

const TONE = { High: "high", Medium: "medium", Low: "low" };

function ColumnRow({ index, column, field, match, fields, duplicate, onChange }) {
  const label = columnLabel(column, index);
  return (
    <tr className={duplicate ? "bg-gunmetal" : ""}>
      <td className="py-2 pr-3 text-sm">{label}</td>
      <td className="py-2 pr-3">
        <select
          aria-label={`Field for ${label}`}
          value={field}
          onChange={(e) => onChange(index, e.target.value)}
          className="focus-ring rounded-xl border border-steel bg-gunmetal px-2 py-1 text-sm"
        >
          <option value={IGNORE}>Ignore</option>
          {fields.map((f) => (
            <option key={f} value={f}>
              {FIELD_LABELS[f] ?? f}
            </option>
          ))}
        </select>
        {duplicate && <span className="ml-2 text-xs text-data-tq">Duplicate</span>}
      </td>
      <td className="py-2 text-sm">
        {match && field === match.field ? (
          <Badge tone={TONE[confidenceLevel(match.confidence)]}>
            {confidenceLevel(match.confidence)} {percent(match.confidence)}%
          </Badge>
        ) : (
          <span className="text-xs text-soft-white/60">{field ? "Set by you" : ""}</span>
        )}
      </td>
    </tr>
  );
}

/** Step 1: match source columns to fields, per uploaded file. */
export default function MappingStep({ projectId, onContinue }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [tab, setTab] = useState("0");
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(() => {
    api
      .getMapping(projectId)
      .then((mapping) => {
        setError("");
        setData(mapping);
        setAssignments(mapping.sheets.map((sheet) => initialAssignments(sheet, mapping.confirmed?.[sheet.file])));
      })
      .catch((e) => setError(e.message));
  }, [projectId]);

  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <p role="status">Loading mapping</p>;

  const sheetIndex = Number(tab);
  const sheet = data.sheets[sheetIndex];
  const current = assignments[sheetIndex];
  const results = assignments.map((a) => validateAssignments(a, data.required));
  const result = results[sheetIndex];
  const allValid = results.every(isValid);

  const confirmedFrom = (list) => Object.fromEntries(data.sheets.map((s, i) => [s.file, list[i]]));

  async function change(column, field) {
    const previous = assignments;
    const next = assignments.map((a, i) => (i === sheetIndex ? { ...a, [column]: field } : a));
    setAssignments(next);
    setSaveError("");
    try {
      await api.saveMapping(projectId, confirmedFrom(next));
    } catch (e) {
      setAssignments(previous);
      setSaveError(`Could not save: ${e.message}`);
    }
  }

  async function reset() {
    setConfirmReset(false);
    const next = data.sheets.map((s) => initialAssignments(s, {}));
    setAssignments(next);
    try {
      await api.saveMapping(projectId, {});
    } catch (e) {
      setSaveError(`Could not save: ${e.message}`);
    }
  }

  const rows = sheet.columns.map((column, index) => ({ column, index, field: current[index], match: sheet.matches?.[column] }));
  const mapped = rows.filter((r) => r.field);
  const unmapped = rows.filter((r) => !r.field);
  const tabs = data.sheets.map((s, i) => ({ id: String(i), label: s.file }));

  const problems = [];
  if (result.missing.length) problems.push(`Required and not mapped: ${result.missing.join(", ")}.`);
  if (result.duplicates.length) problems.push(`Mapped more than once: ${result.duplicates.join(", ")}.`);

  return (
    <div>
      {data.sheets.length > 1 && <Tabs tabs={tabs} value={tab} onChange={setTab} idPrefix="map" />}
      <table className="mt-4 w-full text-left">
        <caption className="sr-only">Column mapping for {sheet.file}</caption>
        <thead className="text-xs uppercase text-soft-white/60">
          <tr>
            <th className="pb-2">Source column</th>
            <th className="pb-2">Field</th>
            <th className="pb-2">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {mapped.map((r) => (
            <ColumnRow
              key={r.index}
              {...r}
              fields={data.fields}
              duplicate={result.duplicates.includes(r.field)}
              onChange={change}
            />
          ))}
        </tbody>
      </table>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm">Unmapped columns ({unmapped.length})</summary>
        <table className="mt-2 w-full text-left">
          <tbody>
            {unmapped.map((r) => (
              <ColumnRow key={r.index} {...r} fields={data.fields} duplicate={false} onChange={change} />
            ))}
          </tbody>
        </table>
      </details>

      {problems.length > 0 && (
        <ul role="alert" className="mt-4 space-y-1 text-sm text-data-tq">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {saveError && (
        <p role="alert" className="mt-2 text-sm text-data-tq">
          {saveError}
        </p>
      )}

      <div className="mt-6 flex items-center gap-3">
        {confirmReset ? (
          <>
            <span className="text-sm">Replace your changes with the automatic match?</span>
            <Button variant="danger" onClick={reset}>
              Yes, replace
            </Button>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmReset(true)}>
            Auto-map again
          </Button>
        )}
        <Button className="ml-auto" disabled={!allValid} onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
