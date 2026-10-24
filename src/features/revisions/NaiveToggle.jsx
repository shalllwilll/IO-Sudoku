import Switch from "../../components/ui/Switch.jsx";

/**
 * Swaps which "moved" figure is shown: the stable (revision-aware) count from the comparison, or
 * what a naive from-scratch re-allocation would have moved. Both come from the comparison object;
 * nothing is recomputed here (the toggle only picks which field to read).
 *
 * `naive_moved` is a mock-only field (docs/contract-gaps.md): disabled, with the reason, when a
 * comparison does not carry one.
 */
export default function NaiveToggle({ naive, onChange, available }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <Switch id="naive-toggle" checked={naive} onChange={onChange} disabled={!available} label="Show the naive re-allocation count" />
      <label htmlFor="naive-toggle" className={available ? "" : "text-soft-white/50"}>
        Naive re-allocation
      </label>
      {!available && <span className="text-soft-white/50">(not available from this run)</span>}
    </div>
  );
}
