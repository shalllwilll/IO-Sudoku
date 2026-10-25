import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/api/config'
import { api, unwrap } from '@/api/client'
import { emptyView, Pacer, reduce, TERMINAL_TYPES, type RunView, type StreamEvent } from './runStream'

const TYPES = [
  'run.started', 'stage.started', 'stage.finished', 'group.formed', 'placement', 'rejection', 'spare.assigned',
  'solver.status', 'fallback.triggered', 'tq.raised', 'validation.result', 'run.finished', 'error',
] // fmt: skip

export type StreamStatus = 'idle' | 'streaming' | 'polling' | 'done'

/**
 * Follows a run's event stream and shows it at reading pace. The backend persists every event, so a reload
 * or a finished run replays the same story. Mount it with a fresh key to replay. If the stream keeps failing it falls back to polling the run.
 */
export function useRunStream(pid: string, rid: string | null): { view: RunView; status: StreamStatus } {
  const [view, setView] = useState<RunView>(emptyView)
  const [status, setStatus] = useState<StreamStatus>(rid ? 'streaming' : 'idle')
  const lastSeq = useRef(0)

  useEffect(() => {
    if (!rid) return
    lastSeq.current = 0
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    const pacer = new Pacer((e) => {
      setView((v) => reduce(v, e))
      if (TERMINAL_TYPES.includes(e.type)) setStatus('done')
    }, reduceMotion)
    let es: EventSource | null = null
    let poll: ReturnType<typeof setInterval> | null = null
    let errors = 0
    let ended = false

    const accept = (e: StreamEvent) => {
      if (e.seq <= lastSeq.current) return
      lastSeq.current = e.seq
      if (TERMINAL_TYPES.includes(e.type)) {
        ended = true
        es?.close()
        if (poll) clearInterval(poll)
      }
      pacer.push(e)
    }

    const startPolling = () => {
      if (ended || poll) return
      es?.close()
      setStatus('polling')
      poll = setInterval(async () => {
        try {
          const run = await unwrap(api.GET('/api/projects/{pid}/runs/{rid}', { params: { path: { pid, rid } } }))
          if (run.status === 'finished') {
            const s = (run.summary ?? {}) as Record<string, number>
            accept({ seq: lastSeq.current + 1, type: 'run.finished', at: '', data: { allocated: s.allocated ?? 0, held_out: s.held_out ?? 0, tqs: s.tqs ?? 0, solver: '' } })
          } else if (run.status === 'failed') {
            accept({ seq: lastSeq.current + 1, type: 'error', at: '', data: { code: 'run_failed', message: run.error ?? 'The run failed.' } })
          }
        } catch {
          /* keep polling; the offline banner already tells the user */
        }
      }, 1500)
    }

    es = new EventSource(`${API_BASE}/api/projects/${encodeURIComponent(pid)}/runs/${encodeURIComponent(rid)}/events`)
    for (const type of TYPES) {
      es.addEventListener(type, (m) => {
        errors = 0
        try {
          accept(JSON.parse((m as MessageEvent<string>).data) as StreamEvent)
        } catch {
          /* ignore a malformed frame */
        }
      })
    }
    es.onerror = () => {
      errors += 1
      if (es?.readyState === EventSource.CLOSED || errors >= 3) startPolling()
    }

    return () => {
      ended = true
      es?.close()
      if (poll) clearInterval(poll)
      pacer.stop()
    }
  }, [pid, rid])

  return { view, status: rid ? status : 'idle' }
}
