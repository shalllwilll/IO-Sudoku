import { FolderPlus, Search } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useCreateProject, useProjects } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, inputClass } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'
import { DEFAULT_PRESET, PRESETS } from '@/lib/presets'
import { projectStatus } from '@/lib/projectStatus'

const tone = { muted: 'bg-surface-3 text-fg-muted', warn: 'bg-warning/15 text-warning', ok: 'bg-success/15 text-success' }

function NewProject({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate()
  const create = useCreateProject()
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [unit, setUnit] = useState('')
  const [preset, setPreset] = useState<string>(DEFAULT_PRESET)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    create.mutate(
      { name: name.trim(), area: area.trim() || null, unit: unit.trim() || null, preset },
      { onSuccess: (p) => nav(`/projects/${p.id}`) },
    )
  }

  return (
    <Dialog open={open} onClose={onClose} title="New project">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Unit 100 allocation" required autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="AR1" className="font-mono" />
          <Field label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="100" className="font-mono" />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Rule preset</span>
          <Segmented<string> label="Rule preset" value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p.value, label: p.label, hint: p.hint }))} />
          <span className="text-xs text-fg-subtle">{PRESETS.find((p) => p.value === preset)?.hint} You can change this later.</span>
        </div>
        {create.isError && (
          <p role="alert" className="text-[13px] text-danger">
            {describeError(create.error)}
          </p>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || create.isPending}>
            {create.isPending ? 'Creating…' : 'Create project'}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export default function Projects() {
  const { data, error, isPending, refetch } = useProjects()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...(data ?? [])]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .filter((p) => !needle || [p.name, p.area, p.unit].some((v) => v?.toLowerCase().includes(needle)))
  }, [data, q])

  if (error && !data) return <ErrorPanel error={error} onRetry={() => void refetch()} />

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 p-8">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold tracking-tight">Projects</h1>
        {data && data.length > 0 && (
          <label className="relative ml-auto">
            <Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" />
            <input aria-label="Search projects" className={cn(inputClass, 'h-9 w-56 pl-8 text-[13px]')} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        )}
        {(!data || data.length > 0) && (
          <Button variant="primary" icon={<FolderPlus size={15} strokeWidth={1.75} />} className={cn(!data && 'ml-auto')} onClick={() => setOpen(true)}>
            New project
          </Button>
        )}
      </div>

      {isPending ? (
        <p className="text-[13px] text-fg-muted">Loading projects…</p>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border-strong p-8">
          <h2 className="text-[15px] font-medium">No projects yet</h2>
          <p className="max-w-md text-[13px] text-fg-muted text-pretty">
            A project holds one unit&apos;s signal list, its mapping decisions, rules and every run. Start by creating one, then upload the MDB workbook.
          </p>
          <Button variant="primary" icon={<FolderPlus size={15} strokeWidth={1.75} />} onClick={() => setOpen(true)}>
            Create your first project
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-fg-muted">No project matches “{q}”.</p>
      ) : (
        <ul className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-card">
          {rows.map((p) => {
            const s = projectStatus(p)
            return (
              <li key={p.id} className="border-b border-border last:border-0">
                <Link to={`/projects/${p.id}`} className="flex items-center gap-4 px-4 py-3 transition-colors duration-150 ease-out hover:bg-surface-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium">{p.name}</div>
                    <div className="mt-0.5 font-mono text-xs text-fg-muted">{[p.area, p.unit].filter(Boolean).join(' · ') || 'No area or unit'}</div>
                  </div>
                  <span className="hidden text-xs text-fg-muted sm:block">{PRESETS.find((x) => x.value === p.preset)?.label ?? p.preset ?? '–'}</span>
                  <span className="hidden w-24 text-right text-xs text-fg-subtle tnum md:block">{new Date(p.created_at).toLocaleDateString()}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tone[s.tone])}>{s.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
      <NewProject key={String(open)} open={open} onClose={() => setOpen(false)} />
    </div>
  )
}
