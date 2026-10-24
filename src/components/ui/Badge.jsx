const tones = {
  neutral: "border-steel text-soft-white",
  high: "border-data-wiredSpare text-data-wiredSpare",
  medium: "border-data-output text-data-output",
  low: "border-data-tq text-data-tq",
  input: "border-data-input text-data-input",
  output: "border-data-output text-data-output",
  reserved: "border-data-reserved text-data-reserved",
};

// Badges carry text, so the meaning survives without colour (WCAG 1.4.1).
export default function Badge({ tone = "neutral", children, className = "" }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}>
      {children}
    </span>
  );
}
