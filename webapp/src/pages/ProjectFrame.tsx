import { Outlet, useParams } from 'react-router-dom'
import { useProject } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'

/** Loads the project once for every nested screen and shows a clear state when it does not exist. */
export default function ProjectFrame() {
  const { pid } = useParams()
  const project = useProject(pid)
  if (project.isError) return <ErrorPanel error={project.error} onRetry={() => void project.refetch()} />
  if (project.isPending) return <p className="p-8 text-[13px] text-fg-muted">Loading project…</p>
  return <Outlet />
}
