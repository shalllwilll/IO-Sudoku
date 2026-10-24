import { useState } from "react";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import Select from "../../components/ui/Select.jsx";
import Switch from "../../components/ui/Switch.jsx";
import { PRIMITIVES, isKnownPrimitive, summarise, validateParam } from "./ruleSchema.js";

function ParamField({ ruleId, name, spec, value, onValid }) {
  const [draft, setDraft] = useState(String(value ?? ""));
  const [error, setError] = useState("");
  const id = `${ruleId}-${name}`;

  if (spec.type === "enum") {
    return (
      <Select id={id} label={name} options={spec.options} value={value} onChange={(e) => onValid(name, e.target.value)} />
    );
  }
  return (
    <Input
      id={id}
      label={name}
      value={draft}
      inputMode={spec.type === "number" ? "decimal" : "text"}
      error={error}
      onChange={(e) => {
        const text = e.target.value;
        setDraft(text);
        const message = validateParam(spec, text);
        setError(message);
        if (!message) onValid(name, spec.type === "number" ? Number(text) : text);
      }}
    />
  );
}

/** One rule: switch, summary, parameter form, lint messages. Unknown types are read-only. */
export default function RuleCard({ rule, index, count, findings = [], onChange, onDelete, onMove }) {
  const [confirming, setConfirming] = useState(false);
  const known = isKnownPrimitive(rule);
  const params = known ? PRIMITIVES[rule.primitive].params : {};

  return (
    <article className="rounded-panel border border-steel bg-carbon p-4" aria-label={rule.name}>
      <header className="flex items-center gap-3">
        <Switch label={`Enable ${rule.name}`} checked={rule.enabled} disabled={!known} onChange={(enabled) => onChange({ ...rule, enabled })} />
        <h3 className="flex-1 text-sm font-semibold">{rule.name}</h3>
        <span className="text-xs text-soft-white/60">Priority {index + 1}</span>
        <button type="button" className="focus-ring px-1" aria-label={`Move ${rule.name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </button>
        <button type="button" className="focus-ring px-1" aria-label={`Move ${rule.name} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
          ↓
        </button>
      </header>
      <p className="mt-2 text-xs text-soft-white/70">{summarise(rule)}</p>

      {!known && (
        <p role="note" className="mt-2 text-xs text-data-output">
          Unknown rule type. Shown read-only and kept as it is when saved.
        </p>
      )}
      {rule.not_enforced_reason && (
        <p className="mt-2 text-xs">
          <Badge tone="medium">Not enforced</Badge> <span className="text-soft-white/80">{rule.not_enforced_reason}</span>
        </p>
      )}

      {known && Object.keys(params).length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          {Object.entries(params).map(([name, spec]) => (
            <ParamField
              key={name}
              ruleId={rule.id}
              name={name}
              spec={spec}
              value={rule.parameters?.[name]}
              onValid={(key, value) => onChange({ ...rule, parameters: { ...rule.parameters, [key]: value } })}
            />
          ))}
        </div>
      )}

      {findings.map((f, i) => (
        <p key={i} role="status" className={`mt-2 text-xs ${f.severity === "error" ? "text-data-tq" : "text-data-output"}`}>
          {f.severity}: {f.message}
        </p>
      ))}

      <footer className="mt-3">
        {confirming ? (
          <span className="flex items-center gap-2 text-sm">
            Delete this rule?
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </span>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)} aria-label={`Delete ${rule.name}`}>
            Delete
          </Button>
        )}
      </footer>
    </article>
  );
}
