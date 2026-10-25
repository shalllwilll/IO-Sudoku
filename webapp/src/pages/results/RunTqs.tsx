import { useParams } from 'react-router-dom'
import { ResolutionCenter } from '@/components/tq/ResolutionCenter'

/** Resolve tab: the project's questions grouped by cause, with the recommended answer for each. */
export default function RunTqs() {
  const { pid = '' } = useParams()
  return (
    <div className="mx-auto w-full max-w-3xl p-8">
      <ResolutionCenter pid={pid} />
    </div>
  )
}
