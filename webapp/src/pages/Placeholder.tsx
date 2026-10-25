/** Stand-in for screens that land in a later milestone. Removed route by route. */
export default function Placeholder({ title, milestone }: { title: string; milestone: string }) {
  return (
    <div className="p-8">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-[13px] text-fg-muted">Built in milestone {milestone}.</p>
    </div>
  )
}
