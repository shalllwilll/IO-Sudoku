import { useId } from "react";

export default function Select({ label, options, error, className = "", id, ...props }) {
  const generated = useId();
  const selectId = id || generated;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={selectId} className="text-sm text-soft-white">
        {label}
      </label>
      <select
        id={selectId}
        aria-invalid={error ? true : undefined}
        className="focus-ring rounded-xl border border-steel bg-gunmetal px-3 py-2 text-soft-white"
        {...props}
      >
        {options.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const text = typeof option === "string" ? option : option.label;
          return (
            <option key={value} value={value}>
              {text}
            </option>
          );
        })}
      </select>
      {error && (
        <p role="alert" className="text-xs text-data-tq">
          {error}
        </p>
      )}
    </div>
  );
}
