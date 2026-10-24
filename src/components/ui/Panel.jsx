export default function Panel({ as: Tag = "section", title, actions, className = "", children, ...props }) {
  return (
    <Tag className={`rounded-panel border border-steel bg-carbon p-5 ${className}`} {...props}>
      {(title || actions) && (
        <header className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </Tag>
  );
}
