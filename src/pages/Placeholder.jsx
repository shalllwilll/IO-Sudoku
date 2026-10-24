// Temporary screens, replaced by later milestones.
export default function Placeholder({ title, children }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children && <p className="mt-2 text-sm text-soft-white/70">{children}</p>}
    </div>
  );
}
