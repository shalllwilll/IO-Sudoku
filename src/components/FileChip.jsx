// Shows the uploaded file name, or "N files". Names are plain text and truncated with a title.
export default function FileChip({ names, className = "" }) {
  const label = names.length === 1 ? names[0] : `${names.length} files`;
  return (
    <span
      data-testid="file-chip"
      title={names.join(", ")}
      className={`inline-flex max-w-[16rem] items-center rounded-full border border-steel bg-gunmetal px-3 py-1 text-xs ${className}`}
    >
      <span className="truncate">{label}</span>
    </span>
  );
}
