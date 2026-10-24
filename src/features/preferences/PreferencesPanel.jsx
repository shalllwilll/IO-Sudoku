import { useEffect, useState } from "react";
import { api } from "../../api/index.js";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Select from "../../components/ui/Select.jsx";
import { DEFAULT_PREFERENCES, PREFERENCE_FIELDS, changedPreferences, validatePreferences } from "./schema.js";

/** Optional, collapsed panel. Reports changed values and validity upward. */
export default function PreferencesPanel({ onChange }) {
  const [open, setOpen] = useState(false);
  const [defaults, setDefaults] = useState(DEFAULT_PREFERENCES);
  const [values, setValues] = useState(DEFAULT_PREFERENCES);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let alive = true;
    api
      .getDefaults()
      .then((d) => {
        if (!alive) return;
        setDefaults(d);
        setValues(d);
      })
      .catch(() => alive && setLoadError("Defaults could not be loaded. Built-in defaults are used."));
    return () => {
      alive = false;
    };
  }, []);

  const errors = validatePreferences(values);
  const valid = Object.keys(errors).length === 0;

  useEffect(() => {
    onChange?.({ changed: changedPreferences(values, defaults), valid });
  }, [values, defaults, valid, onChange]);

  const set = (key) => (event) => setValues((v) => ({ ...v, [key]: event.target.value }));

  return (
    <div className="rounded-panel border border-steel bg-carbon">
      <button
        type="button"
        className="focus-ring flex w-full items-center justify-between rounded-panel px-5 py-3 text-left text-sm font-semibold"
        aria-expanded={open}
        aria-controls="prefs-body"
        onClick={() => setOpen((o) => !o)}
      >
        Preferences (optional)
        <span aria-hidden="true">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div id="prefs-body" className="grid grid-cols-2 gap-4 px-5 pb-5">
          {loadError && <p className="col-span-2 text-xs text-data-output">{loadError}</p>}
          {Object.entries(PREFERENCE_FIELDS).map(([key, spec]) => (
            <Select key={key} label={spec.label} options={spec.options} value={values[key]} onChange={set(key)} error={errors[key]} />
          ))}
          <Input label="Spare percentage" inputMode="decimal" value={values.sparePercent} onChange={set("sparePercent")} error={errors.sparePercent} />
          <div className="col-span-2">
            <Button variant="secondary" onClick={() => setValues(defaults)}>
              Reset to defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
