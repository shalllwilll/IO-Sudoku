import { useRef, useState } from "react";
import { api } from "../../api/index.js";
import Button from "../../components/ui/Button.jsx";
import { PRIMITIVES, validateRule } from "./ruleSchema.js";
import { withTimeout } from "./withTimeout.js";

export const MAX_RULE_TEXT = 500;

/**
 * Checks the compiled output. Exactly one known rule, nothing that edits other rules.
 * Returns { ok, rule?, error? }.
 */
export function checkCompiled(preview) {
  const rule = preview?.rule;
  if (!rule) return { ok: false, error: preview?.message || "Could not understand that rule." };
  if (Array.isArray(rule) || "rules" in preview || "remove" in preview || Array.isArray(rule.rules)) {
    return { ok: false, error: "The result tried to change other rules and was rejected." };
  }
  if (!rule.primitive || !PRIMITIVES[rule.primitive]) return { ok: false, error: "The result used an unknown rule type and was rejected." };
  const errors = validateRule({ ...rule, parameters: rule.parameters ?? {} });
  if (Object.keys(errors).length) return { ok: false, error: "The result had invalid parameters and was rejected." };
  return { ok: true, rule };
}

/** Type a rule in words, review the compiled rule, then apply or discard. Nothing applies by itself. */
export default function PlainEnglishRule({ projectId, onApply }) {
  const [text, setText] = useState("");
  const [state, setState] = useState({ phase: "idle" });
  const busy = useRef(false);

  async function compile() {
    const request = text.trim();
    if (!request || busy.current) return;
    if (request.length > MAX_RULE_TEXT) {
      setState({ phase: "error", message: `Text is ${request.length} characters. The limit is ${MAX_RULE_TEXT}.` });
      return;
    }
    busy.current = true;
    setState({ phase: "working" });
    try {
      const preview = await withTimeout(api.compileRule(projectId, request), 20000);
      const checked = checkCompiled(preview);
      if (!checked.ok) setState({ phase: "rejected", message: checked.error });
      else setState({ phase: "ready", rule: checked.rule, sentence: preview.message });
    } catch (e) {
      setState({ phase: "error", message: e?.name === "TimeoutError" ? "That took too long. Try again." : "AI unavailable. Use the form above." });
    } finally {
      busy.current = false;
    }
  }

  return (
    <section aria-label="Plain-English rule" className="rounded-panel border border-steel bg-carbon p-4">
      <h2 className="mb-2 text-base font-semibold">Add a rule in words</h2>
      <textarea
        aria-label="Rule in plain English"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        className="focus-ring w-full rounded-xl border border-steel bg-gunmetal p-2 text-sm"
        placeholder="For example: never put A and B in the same CIOC"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button onClick={compile} disabled={state.phase === "working" || !text.trim()}>
          {state.phase === "working" ? "Compiling" : "Compile"}
        </Button>
        <span className="text-xs text-soft-white/60">{text.length}/{MAX_RULE_TEXT}</span>
      </div>

      {(state.phase === "error" || state.phase === "rejected") && (
        <p role="alert" className="mt-3 text-sm text-data-tq">
          {state.message}
        </p>
      )}

      {state.phase === "ready" && (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            <span className="mr-2 rounded-full border border-soft-white/50 px-1.5 text-[10px] uppercase">AI-generated</span>
            {state.sentence}
          </p>
          <pre className="overflow-x-auto rounded-xl bg-gunmetal p-2 text-xs">{JSON.stringify(state.rule, null, 2)}</pre>
          <div className="flex gap-2">
            <Button
              onClick={() => {
                onApply(state.rule);
                setState({ phase: "idle" });
                setText("");
              }}
            >
              Apply
            </Button>
            <Button variant="secondary" onClick={() => setState({ phase: "idle" })}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
