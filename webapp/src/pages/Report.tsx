import { ArrowLeft } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { reportXlsxUrl, revisionXlsxUrl } from '@/api/client'
import { useRevisionReportDoc, useRunReportDoc } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { ReportView } from '@/components/report/ReportView'

const back = (to: string, label: string) => (
  <Link to={to} className="inline-flex items-center gap-1.5 text-[13px] text-fg-muted hover:text-fg">
    <ArrowLeft size={14} strokeWidth={1.75} /> {label}
  </Link>
)

/** Allocation or technical query report of one run. */
export function RunReport() {
  const { pid = '', rid = '', kind = 'allocation' } = useParams()
  const k = kind === 'tq' ? 'tq' : 'allocation'
  const q = useRunReportDoc(pid, rid, k)
  if (q.isError) return <ErrorPanel error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <p className="p-8 text-[13px] text-fg-muted">Building report…</p>
  return <ReportView doc={q.data} xlsx={reportXlsxUrl(pid, rid, k)} back={back(`/projects/${pid}/runs/${rid}/summary`, 'Back to results')} />
}

/** Revision A against revision B, from the query string. */
export function RevisionReport() {
  const { pid = '' } = useParams()
  const sp = useSearchParams()[0]
  const from = sp.get('from') ?? ''
  const to = sp.get('to') ?? ''
  const q = useRevisionReportDoc(pid, from, to)
  if (q.isError) return <ErrorPanel error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <p className="p-8 text-[13px] text-fg-muted">Building report…</p>
  return <ReportView doc={q.data} xlsx={revisionXlsxUrl(pid, from, to)} back={back(`/projects/${pid}/revisions`, 'Back to revisions')} />
}
