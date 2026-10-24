import { useEffect, useMemo, useState } from "react";
import { api } from "../../api/index.js";
import Button from "../../components/ui/Button.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import Input from "../../components/ui/Input.jsx";
import Switch from "../../components/ui/Switch.jsx";
import { BASE_TYPES, normaliseIoType } from "./normaliseIoType.js";
import { DEFAULT_GROUPING_RULE, parseGrouping } from "./parseGrouping.js";

const IGNORED = "ignore";

/** Step 2: confirm IO type values and how the grouping column is read. */
export default function ValuesStep({ projectId, onContinue }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);
  const [edits, setEdits] = useState({}); // raw value -> base type or "ignore"
  const [shape, setShape] = useState("one");
  const [prefixText, setPrefixText] = useState(DEFAULT_GROUPING_RULE.prefixes.join(","));
  const [separator, setSeparator] = useState(DEFAULT_GROUPING_RULE.separator);
  const [bare, setBare] = useState(DEFAULT_GROUPING_RULE.bareLettersAreGroups);

  function load() {
    api
      .getValues(projectId)
      .then((d) => {
        setError("");
        setData(d);
      })
      .catch((e) => setError(e.message));
  }
  useEffect(load, [projectId]);

  const rule = useMemo(
    () => ({ prefixes: prefixText.split(",").map((p) => p.trim()).filter(Boolean), separator, bareLettersAreGroups: bare }),
    [prefixText, separator, bare],
  );

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <p role="status">Loading values</p>;

  const ioValues = data.observed?.io_type ?? data.unknown.filter((u) => u.field === "io_type").map((u) => ({ value: u.value, count: u.count }));
  const groupingValues = data.observed?.grouping ?? [];

  const resolved = ioValues.map(({ value, count }) => {
    const auto = normaliseIoType(value);
    const chosen = edits[value];
    const base = chosen === IGNORED ? IGNORED : (chosen ?? auto.base);
    return { value, count, base, duty: auto.duty, unknown: !base };
  });
  const blocked = resolved.some((r) => r.unknown);

  async function save() {
    setBusy(true);
    setSaveError("");
    const io_types = {};
    for (const r of resolved) if (r.base && r.base !== IGNORED) io_types[r.value] = r.duty ? `${r.base}-${r.duty}` : r.base;
    const segregation = {};
    if (shape === "one") {
      for (const { value } of groupingValues) {
        const parsed = parseGrouping(value, rule);
        if (parsed.segregation) segregation[value] = parsed.segregation;
      }
    }
    try {
      await api.saveValues(projectId, { io_types, duty_classes: {}, segregation });
      onContinue();
    } catch (e) {
      setSaveError(`Could not save: ${e.message}`); // edits are kept
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-base font-semibold">IO type values</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-soft-white/60">
            <tr>
              <th>Value in file</th>
              <th>Rows</th>
              <th>Base type</th>
              <th>Duty</th>
            </tr>
          </thead>
          <tbody>
            {resolved.map((r) => (
              <tr key={r.value}>
                <td className="py-1 font-mono">{r.value}</td>
                <td>{r.count}</td>
                <td>
                  <select
                    aria-label={`Base type for ${r.value}`}
                    value={r.base ?? ""}
                    onChange={(e) => setEdits((c) => ({ ...c, [r.value]: e.target.value || undefined }))}
                    className="focus-ring rounded-xl border border-steel bg-gunmetal px-2 py-1"
                  >
                    <option value="">Unknown</option>
                    {BASE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                    <option value={IGNORED}>Ignore</option>
                  </select>
                  {r.unknown && <span className="ml-2 text-xs text-data-tq">Unknown: assign or ignore</span>}
                </td>
                <td>{r.duty ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Grouping</h2>
        <div className="mb-3 flex gap-4 text-sm" role="radiogroup" aria-label="Grouping shape">
          <label>
            <input type="radio" name="shape" checked={shape === "one"} onChange={() => setShape("one")} /> One column
          </label>
          <label>
            <input type="radio" name="shape" checked={shape === "two"} onChange={() => setShape("two")} /> Two columns (Grp and Seg)
          </label>
        </div>
        {shape === "one" && (
          <>
            <div className="mb-3 grid grid-cols-3 items-end gap-4">
              <Input label="Segregation prefixes (comma separated)" value={prefixText} onChange={(e) => setPrefixText(e.target.value)} />
              <Input label="Separator" maxLength={3} value={separator} onChange={(e) => setSeparator(e.target.value)} />
              <div className="flex items-center gap-2 pb-2 text-sm">
                <Switch label="Bare letters are groups" checked={bare} onChange={setBare} />
                Bare letters are groups
              </div>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-soft-white/60">
                <tr>
                  <th>Value</th>
                  <th>Group</th>
                  <th>Segregation</th>
                </tr>
              </thead>
              <tbody>
                {groupingValues.map(({ value }) => {
                  const p = parseGrouping(value, rule);
                  return (
                    <tr key={value}>
                      <td className="py-1 font-mono">{value}</td>
                      <td>{p.status === "unparsed" ? "unparsed" : (p.group ?? "none")}</td>
                      <td>{p.status === "unparsed" ? "unparsed" : (p.segregation ?? "none")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
        {shape === "two" && <p className="text-sm text-soft-white/80">Map the Grp and Seg columns in the previous step. They are used as they are.</p>}
      </section>

      {saveError && (
        <p role="alert" className="text-sm text-data-tq">
          {saveError}
        </p>
      )}
      <div className="flex justify-end">
        <Button disabled={blocked || busy} onClick={save}>
          Continue
        </Button>
      </div>
    </div>
  );
}
