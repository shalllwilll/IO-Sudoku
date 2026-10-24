export default function Switch({ checked, onChange, label, disabled = false, id }) {
  return (
    <button
      type="button"
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`focus-ring relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-steel transition-colors disabled:opacity-40 ${
        checked ? "bg-soft-white" : "bg-gunmetal"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block h-4 w-4 rounded-full transition-transform ${
          checked ? "translate-x-[1.4rem] bg-graphite" : "translate-x-[0.2rem] bg-soft-white"
        }`}
      />
    </button>
  );
}
