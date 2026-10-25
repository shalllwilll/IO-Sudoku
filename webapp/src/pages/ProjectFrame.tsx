import { useMemo } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import { useMapping, useProject, useValues } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { StepRail, type Step, type StepState } from '@/components/StepRail'
import { importHealth } from '@/lib/importHealth'

/** Import covers the upload and its two review screens, so the rail stays three steps long. */
const STEPS = [
  ['data', 'Import'],
  ['rules', 'Rules'],
  ['run', 'Allocate'],
] as const
const SECTION_STEP: Record<string, string> = { data: 'data', map: 'data', values: 'data', rules: 'rules', run: 'run' }

/** Loads the project once for every nested screen, shows the step rail, and a clear state when the project does not exist. */
export default function ProjectFrame() {
  const { pid = '' } = useParams()
  const section = useLocation().pathname.split('/')[3] ?? 'data'
  const project = useProject(pid)
  const hasData = (project.data?.uploads ?? 0) > 0
  const mapping = useMapping(pid, hasData)
  const values = useValues(pid, hasData)

  const steps: Step[] = useMemo(() => {
    const h = importHealth(mapping.data, values.data)
    const base: Record<string, { state: StepState; note?: string }> = {
      data: { state: !hasData ? 'attention' : h.ok ? 'done' : 'attention', note: hasData && h.missing.length ? 'Required missing' : hasData && h.open ? `${h.open} to review` : undefined },
      rules: { state: hasData ? 'done' : 'todo' },
      run: { state: (project.data?.runs ?? 0) > 0 ? 'done' : 'todo' },
    }
    return STEPS.map(([id, label]) => {
      const b = base[id]
      return { id, label, to: `/projects/${pid}/${id}`, ...b, state: id === SECTION_STEP[section] ? 'current' : b.state }
    })
  }, [hasData, mapping.data, values.data, pid, section, project.data?.runs])

  if (project.isError) return <ErrorPanel error={project.error} onRetry={() => void project.refetch()} />
  if (project.isPending) return <p className="p-8 text-[13px] text-fg-muted">Loading project…</p>
  const inStepArea = section in SECTION_STEP
  return (
    <div className="flex min-h-full flex-col">
      {inStepArea && (
        <div className="border-b border-border px-6 py-2.5">
          <StepRail steps={steps} />
        </div>
      )}
      <Outlet />
    </div>
  )
}
