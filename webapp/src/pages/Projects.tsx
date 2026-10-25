import { ChevronDown, FileSpreadsheet, FlaskConical, FolderPlus, History, Search, Sparkles } from 'lucide-react'
import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, unwrap } from '@/api/client'
import { describeError } from '@/api/errors'
import { useCreateProject, useLoadSample, useProjects, type Project } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { Button } from '@/components/ui/Button'
import { Field, inputClass } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'
import { DEFAULT_PRESET, PRESETS } from '@/lib/presets'
import { projectStatus } from '@/lib/projectStatus'
import { checkFile } from '@/lib/upload'

const tone = { muted: 'bg-surface-3 text-fg-muted', warn: 'bg-warning/15 text-warning', ok: 'bg-success/15 text-success' }

async function uploadForProject(pid: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  return unwrap(api.POST('/api/projects/{pid}/uploads', { params: { path: { pid } }, body: { file: '' }, bodySerializer: () => form }))
}

/** The default landing surface. A project is created before an optional workbook upload is sent. */
function StartProject() {
  const nav = useNavigate()
  const create = useCreateProject()
  const picker = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [area, setArea] = useState('')
  const [unit, setUnit] = useState('')
  const [preset, setPreset] = useState<string>(DEFAULT_PRESET)
  const [file, setFile] = useState<File | null>(null)
  const [rule, setRule] = useState('')
  const [details, setDetails] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const choose = (next: File | undefined) => {
    setProblem(null)
    if (!next) return setFile(null)
    const bad = checkFile(next)
    if (bad) return setProblem(`${next.name}: ${bad}`)
    setFile(next)
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setProblem(null)
    setSubmitting(true)
    try {
      const project = await create.mutateAsync({ name: name.trim(), area: area.trim() || null, unit: unit.trim() || null, preset })
      if (file) await uploadForProject(project.id, file)
      const target = rule.trim() ? 'rules' : 'data'
      nav(`/projects/${project.id}/${target}`, { state: rule.trim() ? { initialRule: rule.trim() } : undefined })
    } catch (error) {
      setProblem(describeError(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section aria-labelledby="start-title" className="rounded-xl border border-border bg-surface-1 p-6 shadow-card sm:p-8">
      <div className="max-w-2xl">
        <div className="flex items-center gap-2 text-accent"><FolderPlus size={17} strokeWidth={1.75} /><span className="text-xs font-medium uppercase tracking-[0.12em]">New allocation</span></div>
        <h1 id="start-title" className="mt-3 text-2xl font-semibold tracking-tight">Start with the signal list and the constraints that matter.</h1>
        <p className="mt-2 text-[14px] text-fg-muted text-pretty">Create a project, add the Excel workbook, then describe a rule in your own words. Everything else can wait until you need it.</p>
      </div>
      <form onSubmit={submit} className="mt-7 flex max-w-2xl flex-col gap-5">
        <Field label="Project name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Unit 100 allocation" required autoFocus />
        <div className="rounded-lg border border-dashed border-border-strong bg-surface-2/50 p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1"><p className="text-[13px] font-medium">Signal workbook</p><p className="mt-0.5 text-xs text-fg-muted">Upload an .xlsx signal list now, or create the project first and import it later.</p>{file ? <p className="mt-2 truncate font-mono text-xs text-success">Ready: {file.name}</p> : null}</div>
            <Button type="button" variant="secondary" onClick={() => picker.current?.click()}>{file ? 'Replace' : 'Choose Excel'}</Button>
          </div>
          <input ref={picker} type="file" accept=".xlsx" hidden aria-label="Signal workbook" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = '' }} />
        </div>
        <div className="rounded-lg border border-border bg-surface-2/50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" />
            <div className="min-w-0 flex-1"><label htmlFor="first-rule" className="text-[13px] font-medium">Describe a rule in plain English <span className="font-normal text-fg-subtle">optional</span></label><p className="mt-0.5 text-xs text-fg-muted">For example: “Keep AIR and DOR on separate CIOCs.” You will review the rule before it is added.</p><textarea id="first-rule" value={rule} onChange={(e) => setRule(e.target.value)} maxLength={600} rows={2} placeholder="Describe an allocation constraint…" className="mt-3 w-full resize-y rounded-md border border-border-strong bg-surface-1 px-3 py-2 text-[13px] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft" /></div>
          </div>
        </div>
        <div>
          <button type="button" aria-expanded={details} onClick={() => setDetails((v) => !v)} className="flex items-center gap-1.5 text-[13px] text-fg-muted transition-[color] duration-150 ease-out hover:text-fg">Project details and rule preset <ChevronDown size={14} strokeWidth={1.75} className={cn('transition-[rotate] duration-150 ease-out', details && 'rotate-180')} /></button>
          {details && <div className="mt-3 grid gap-4 rounded-lg border border-border bg-surface-2/50 p-4 sm:grid-cols-2"><Field label="Area" value={area} onChange={(e) => setArea(e.target.value)} placeholder="AR1" className="font-mono" /><Field label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="100" className="font-mono" /><div className="sm:col-span-2"><span className="text-[13px] font-medium">Rule preset</span><Segmented<string> label="Rule preset" value={preset} onChange={setPreset} options={PRESETS.map((p) => ({ value: p.value, label: p.label, hint: p.hint }))} /><p className="mt-1.5 text-xs text-fg-subtle">{PRESETS.find((p) => p.value === preset)?.hint} You can adjust this later.</p></div></div>}
        </div>
        {problem && <p role="alert" className="text-[13px] text-danger">{problem}</p>}
        <div className="flex flex-wrap items-center gap-3"><Button type="submit" variant="primary" disabled={!name.trim() || submitting} icon={<FolderPlus size={15} strokeWidth={1.75} />}>{submitting ? (file ? 'Creating and importing…' : 'Creating…') : 'Create project'}</Button><span className="text-xs text-fg-subtle">You can review mapping, rules and assumptions before allocating.</span></div>
      </form>
    </section>
  )
}

function ProjectHistory({ rows }: { rows: Project[] | undefined }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const sample = useLoadSample()
  const nav = useNavigate()
  const loadSample = () => sample.mutate(undefined, { onSuccess: (r) => nav(r.created && r.run_id ? `/projects/${r.project_id}/run?run=${r.run_id}` : r.run_id ? `/projects/${r.project_id}/runs/${r.run_id}` : `/projects/${r.project_id}`) })
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...(rows ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((p) => !needle || [p.name, p.area, p.unit].some((v) => v?.toLowerCase().includes(needle)))
  }, [rows, q])
  return (
    <section aria-label="Project history" className="rounded-lg border border-border bg-surface-1 shadow-card">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-[background-color] duration-150 ease-out hover:bg-surface-2"><History size={16} strokeWidth={1.75} className="text-fg-muted" /><span className="text-[13px] font-medium">Project history</span><span className="text-xs text-fg-muted tnum">{rows?.length ?? 0} saved {(rows?.length ?? 0) === 1 ? 'project' : 'projects'}</span><ChevronDown size={15} strokeWidth={1.75} className={cn('ml-auto text-fg-muted transition-[rotate] duration-150 ease-out', open && 'rotate-180')} /></button>
      {open && <div className="border-t border-border p-3"><div className="mb-3 flex flex-wrap items-center gap-2"><label className="relative min-w-52 flex-1"><Search size={14} strokeWidth={1.75} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-subtle" /><input aria-label="Search projects" className={cn(inputClass, 'h-9 w-full pl-8 text-[13px]')} placeholder="Search project history" value={q} onChange={(e) => setQ(e.target.value)} /></label><Button variant="secondary" icon={<FlaskConical size={15} strokeWidth={1.75} />} disabled={sample.isPending} onClick={loadSample}>{sample.isPending ? 'Loading sample…' : 'Load sample plant'}</Button></div>{sample.isError && <p role="alert" className="mb-3 text-[13px] text-danger">{describeError(sample.error)}</p>}{visible.length === 0 ? <p className="px-1 py-3 text-[13px] text-fg-muted">No project matches “{q}”.</p> : <ul className="overflow-hidden rounded-md border border-border">{visible.map((p) => { const s = projectStatus(p); return <li key={p.id} className="border-b border-border last:border-0"><Link to={`/projects/${p.id}`} className="flex items-center gap-4 px-4 py-3 transition-[background-color] duration-150 ease-out hover:bg-surface-2"><div className="min-w-0 flex-1"><div className="truncate text-[14px] font-medium">{p.name}</div><div className="mt-0.5 font-mono text-xs text-fg-muted">{[p.area, p.unit].filter(Boolean).join(' · ') || 'No area or unit'}</div></div><span className="hidden text-xs text-fg-muted sm:block">{PRESETS.find((x) => x.value === p.preset)?.label ?? p.preset ?? '–'}</span><span className="hidden w-24 text-right text-xs text-fg-subtle tnum md:block">{new Date(p.created_at).toLocaleDateString()}</span><span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', tone[s.tone])}>{s.label}</span></Link></li> })}</ul>}</div>}
    </section>
  )
}

export default function Projects() {
  const { data, error, isPending, refetch } = useProjects()
  if (error && !data) return <ErrorPanel error={error} onRetry={() => void refetch()} />
  return <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-8"><StartProject />{isPending ? <p className="text-[13px] text-fg-muted">Loading project history…</p> : <ProjectHistory rows={data} />}</div>
}
