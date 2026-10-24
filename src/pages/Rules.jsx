import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/index.js";
import Button from "../components/ui/Button.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import PlainEnglishRule from "../features/rules/PlainEnglishRule.jsx";
import RuleCard from "../features/rules/RuleCard.jsx";
import { PRIMITIVES, newRule } from "../features/rules/ruleSchema.js";
import { withTimeout } from "../features/rules/withTimeout.js";
import RuleSetsBar from "../features/rulesets/RuleSetsBar.jsx";

export default function Rules() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [rules, setRules] = useState([]);
  const [baseline, setBaseline] = useState("[]");
  const [active, setActive] = useState(null);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [note, setNote] = useState("");
  const [findings, setFindings] = useState({});
  const [dry, setDry] = useState(null);
  const [toolError, setToolError] = useState("");
  const [addType, setAddType] = useState("separate");
  const linting = useRef(false);
  const dryRunning = useRef(false);

  const load = useCallback(() => {
    api
      .getRules(id)
      .then((r) => {
        setError("");
        setState(r);
        setRules(r.rules);
        setBaseline(JSON.stringify(r.rules));
      })
      .catch((e) => setError(e.message));
  }, [id]);
  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!state) return <p role="status">Loading rules</p>;

  // Disabled rules stay in the payload with enabled: false so saved sets round-trip exactly.
  async function persist(next) {
    setRules(next);
    setSaveError("");
    try {
      await api.saveRules(id, { rules: next });
    } catch (e) {
      setSaveError(`Could not save rules: ${e.message}`);
    }
  }

  const change = (index, rule) => persist(rules.map((r, i) => (i === index ? rule : r)));
  const remove = (index) => persist(rules.filter((_, i) => i !== index));
  const move = (index, dir) => {
    const next = [...rules];
    [next[index], next[index + dir]] = [next[index + dir], next[index]];
    persist(next);
  };

  async function runTool(kind) {
    const ref = kind === "lint" ? linting : dryRunning;
    if (ref.current) return;
    ref.current = true;
    setToolError("");
    try {
      const result = await withTimeout(api.lintRules(id, rules), 30000);
      if (kind === "lint") {
        const grouped = {};
        for (const f of result.findings) (grouped[f.rule_id] ||= []).push(f);
        setFindings(grouped);
        if (result.findings.length === 0) setNote("Lint found no problems.");
      } else {
        setDry(result.dry_run?.[0] ?? {});
      }
    } catch (e) {
      setToolError(e?.name === "TimeoutError" ? "That took longer than 30 seconds. Try again." : `Failed: ${e.message}`);
    } finally {
      ref.current = false;
    }
  }

  async function loadPreset(preset, message = "") {
    try {
      const r = await api.saveRules(id, { preset });
      setState(r);
      setRules(r.rules);
      setBaseline(JSON.stringify(r.rules));
      setActive(null);
      setNote(message);
    } catch (e) {
      setSaveError(`Could not load preset: ${e.message}`);
    }
  }

  async function applyAi(rule) {
    const unique = { ...rule, id: `${rule.id}-${rules.length}` };
    await persist([...rules, unique]);
    runTool("lint");
  }

  const unsaved = active ? JSON.stringify(rules) !== baseline : false;
  const counts = dry && Object.entries(dry).filter(([, v]) => typeof v === "number");

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-semibold">Rules</h1>
      <RuleSetsBar
        projectId={id}
        rules={rules}
        presets={state.presets}
        preset={state.preset}
        unsaved={unsaved}
        active={active}
        onLoad={(r, name) => {
          persist(r);
          setBaseline(JSON.stringify(r));
          setActive(name);
        }}
        onPreset={loadPreset}
        onSaved={(name) => {
          setActive(name);
          setBaseline(JSON.stringify(rules));
        }}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => runTool("lint")}>
          Lint
        </Button>
        <Button variant="secondary" onClick={() => runTool("dry")}>
          Dry-run
        </Button>
        <select aria-label="Rule type" value={addType} onChange={(e) => setAddType(e.target.value)} className="focus-ring ml-auto rounded-xl border border-steel bg-gunmetal px-2 py-1 text-sm">
          {Object.entries(PRIMITIVES).map(([key, spec]) => (
            <option key={key} value={key}>
              {spec.label}
            </option>
          ))}
        </select>
        <Button onClick={() => persist([...rules, newRule(addType)])}>Add rule</Button>
      </div>

      {note && <p role="status" className="text-sm">{note}</p>}
      {toolError && <p role="alert" className="text-sm text-data-tq">{toolError}</p>}
      {saveError && <p role="alert" className="text-sm text-data-tq">{saveError}</p>}
      {counts && (
        <dl aria-label="Dry-run result" className="flex gap-6 rounded-panel border border-steel p-3 text-sm">
          {counts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs uppercase text-soft-white/60">{k.replace(/_/g, " ")}</dt>
              <dd className="text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <div className="space-y-3">
        {rules.map((rule, index) => (
          <RuleCard
            key={rule.id}
            rule={rule}
            index={index}
            count={rules.length}
            findings={findings[rule.id]}
            onChange={(r) => change(index, r)}
            onDelete={() => remove(index)}
            onMove={(dir) => move(index, dir)}
          />
        ))}
      </div>

      <PlainEnglishRule projectId={id} onApply={applyAi} />

      <div className="flex justify-end">
        <Button onClick={() => navigate(`/projects/${id}/run`)}>Continue to run</Button>
      </div>
    </div>
  );
}
