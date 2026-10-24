export default function EmptyState({ title, children }) {
  return (
    <div className="rounded-panel border border-dashed border-steel p-6 text-center">
      <p className="font-medium">{title}</p>
      {children && <div className="mt-2 text-sm text-soft-white/80">{children}</div>}
    </div>
  );
}
