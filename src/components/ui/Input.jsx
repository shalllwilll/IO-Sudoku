import { useId } from "react";

export default function Input({ label, error, hint, className = "", id, ...props }) {
  const generated = useId();
  const inputId = id || generated;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={inputId} className="text-sm text-soft-white">
        {label}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className="focus-ring rounded-xl border border-steel bg-gunmetal px-3 py-2 text-soft-white placeholder:text-steel"
        {...props}
      />
      {hint && (
        <p id={hintId} className="text-xs text-soft-white/70">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-data-tq">
          {error}
        </p>
      )}
    </div>
  );
}
