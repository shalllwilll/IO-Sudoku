import { useMemo } from 'react'
import { Outlet, useLocation, useParams } from 'react-router-dom'
import { useMapping, useProject, useValues } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { StepRail, type Step, type StepState } from '@/components/StepRail'
import { currentSelection, missingRequired } from '@/lib/mapping'
import { undecided } from '@/lib/values'

const STEPS = [
  ['data', 'Data'],
  ['map', 'Map'],
  ['values', 'Values'],
  ['rules', 'Rules'],
  ['run', 'Run'],
] as const

/** Loads the project once for every nested screen, shows the step rail, and a clear state when the project does not exist. */
export default function ProjectFrame() {
  const { pid = '' } = useParams()
  const section = useLocation().pathname.split('/')[3] ?? 'data'
  const project = useProject(pid)
  const hasData = (project.data?.uploads ?? 0) > 0
  const mapping = useMapping(pid, hasData)
  const values = useValues(pid, hasData)

  const steps: Step[] = useMemo(() => {
    const mapNeeds = mapping.data
      ? mapping.data.sheets.some((s) => missingRequired(currentSelection(s, mapping.data.fields, mapping.data.confirmed[s.file]), mapping.data.required).length > 0)
      : false
    const open = values.data ? undecided(values.data.unknown, values.data.overrides).length : 0
    const base: Record<string, { state: StepState; note?: string }> = {
      data: { state: hasData ? 'done' : 'attention' },
      map: { state: !hasData ? 'todo' : mapNeeds ? 'attention' : 'done', note: mapNeeds ? 'Required missing' : undefined },
      values: { state: !hasData ? 'todo' : open > 0 ? 'attention' : 'done', note: open > 0 ? `${open} to review` : undefined },
      rules: { state: hasData ? 'done' : 'todo' },
      run: { state: (project.data?.runs ?? 0) > 0 ? 'done' : 'todo' },
    }
    return STEPS.map(([id, label]) => {
      const b = base[id]
      return { id, label, to: `/projects/${pid}/${id}`, ...b, state: id === section ? 'current' : b.state }
    })
  }, [hasData, mapping.data, values.data, pid, section, project.data?.runs])

  if (project.isError) return <ErrorPanel error={project.error} onRetry={() => void project.refetch()} />
  if (project.isPending) return <p className="p-8 text-[13px] text-fg-muted">Loading project…</p>
  const inStepArea = STEPS.some(([id]) => id === section)
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
