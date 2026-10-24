import { useState } from "react";
import Button from "../../components/ui/Button.jsx";
import { exportSet, importSet, loadSets, storeSets, validateSetName } from "./ruleSets.js";

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\w.-]+/g, "_")}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Save, load, rename, delete, export and import named rule sets, plus the backend presets. */
export default function RuleSetsBar({ projectId, rules, presets, preset, unsaved, active, onLoad, onPreset, onSaved }) {
  const [sets, setSets] = useState(() => loadSets(projectId));
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(null); // load awaiting confirmation over unsaved edits
  const [renaming, setRenaming] = useState("");

  const names = sets.map((s) => s.name);
  const commit = (next) => {
    setSets(next);
    storeSets(projectId, next);
  };

  function saveAs() {
    const message = validateSetName(name, names);
    if (message) return setError(message);
    commit([...sets, { name: name.trim(), version: 1, rules: structuredClone(rules) }]);
    onSaved(name.trim());
    setName("");
    setError("");
  }

  function load(setName) {
    const found = sets.find((s) => s.name === setName);
    if (!found) return;
    if (unsaved) setPending({ kind: "set", value: found });
    else onLoad(found.rules, found.name);
  }

  function loadPreset(value) {
    if (!value) return;
    if (unsaved) setPending({ kind: "preset", value });
    else onPreset(value);
  }

  function confirmPending() {
    if (pending.kind === "set") onLoad(pending.value.rules, pending.value.name);
    else onPreset(pending.value);
    setPending(null);
  }

  function remove() {
    if (!active) return;
    commit(sets.filter((s) => s.name !== active));
    onPreset(preset, "The active set was deleted. Defaults restored.");
  }

  function rename() {
    const message = validateSetName(renaming, names.filter((n) => n !== active));
    if (message) return setError(message);
    commit(sets.map((s) => (s.name === active ? { ...s, name: renaming.trim() } : s)));
    onSaved(renaming.trim());
    setRenaming("");
    setError("");
  }

  async function onImport(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importSet(file.size > 1024 * 1024 ? "x".repeat(1024 * 1024 + 1) : await file.text());
    if (!result.ok) return setError(result.error);
    let finalName = result.set.name.trim();
    while (names.includes(finalName)) finalName += " (imported)";
    commit([...sets, { ...result.set, name: finalName.slice(0, 60) }]);
    setError("");
  }

  return (
    <section aria-label="Rule sets" className="rounded-panel border border-steel bg-carbon p-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          Active set: <strong>{active ?? "none"}</strong>
          {unsaved && <span className="ml-2 text-data-output">Unsaved changes</span>}
        </span>
        <label className="flex items-center gap-2">
          Load
          <select aria-label="Load rule set" value="" onChange={(e) => load(e.target.value)} className="focus-ring rounded-xl border border-steel bg-gunmetal px-2 py-1">
            <option value="">Choose</option>
            {names.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Preset
          <select aria-label="Load preset" value="" onChange={(e) => loadPreset(e.target.value)} className="focus-ring rounded-xl border border-steel bg-gunmetal px-2 py-1">
            <option value="">{preset}</option>
            {presets.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input aria-label="Set name" value={name} onChange={(e) => setName(e.target.value)} className="focus-ring rounded-full border border-steel bg-gunmetal px-3 py-1 text-sm" placeholder="Name" />
        <Button variant="secondary" onClick={saveAs}>
          Save as
        </Button>
        {active && (
          <>
            <input aria-label="New name" value={renaming} onChange={(e) => setRenaming(e.target.value)} className="focus-ring rounded-full border border-steel bg-gunmetal px-3 py-1 text-sm" placeholder="Rename to" />
            <Button variant="secondary" onClick={rename} disabled={!renaming.trim()}>
              Rename
            </Button>
            <Button variant="secondary" onClick={() => download(active, exportSet(active, rules))}>
              Export
            </Button>
            <Button variant="danger" onClick={remove}>
              Delete set
            </Button>
          </>
        )}
        <label className="focus-ring cursor-pointer rounded-full border border-steel px-4 py-1.5 text-sm hover:bg-gunmetal">
          Import
          <input type="file" accept=".json,application/json" hidden data-testid="import-input" onChange={onImport} />
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-sm text-data-tq">
          {error}
        </p>
      )}
      {pending && (
        <p role="alertdialog" className="mt-2 flex items-center gap-2 text-sm">
          You have unsaved changes. Load anyway?
          <Button variant="danger" onClick={confirmPending}>
            Load
          </Button>
          <Button variant="secondary" onClick={() => setPending(null)}>
            Cancel
          </Button>
        </p>
      )}
    </section>
  );
}
