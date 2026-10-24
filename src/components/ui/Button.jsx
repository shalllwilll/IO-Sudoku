const variants = {
  primary: "bg-soft-white text-graphite hover:bg-white",
  secondary: "border border-steel text-soft-white hover:bg-gunmetal",
  ghost: "text-soft-white hover:bg-gunmetal",
  danger: "border border-data-tq text-data-tq hover:bg-gunmetal",
};

export default function Button({ variant = "primary", className = "", type = "button", children, ...props }) {
  const base =
    "focus-ring inline-flex items-center justify-center rounded-full px-5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  return (
    <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
