import { useRef } from 'react'
import { describeError } from '@/api/errors'
import { useMineRun, useMineUpload, useRuns, type Candidate } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { asRules, describeRule, type Rule } from '@/lib/rules'

export function MineDialog({ pid, open, onClose, onAdd, haveIds }: { pid: string; open: boolean; onClose: () => void; onAdd: (r: Rule) => void; haveIds: Set<string> }) {
  const runs = useRuns(pid, open)
  const mineRun = useMineRun(pid)
  const mineFile = useMineUpload(pid)
  const input = useRef<HTMLInputElement>(null)
  const latest = runs.data?.find((r) => r.status === 'finished')
  const result = mineFile.data ?? mineRun.data
  const error = mineFile.error ?? mineRun.error

  return (
    <Dialog open={open} onClose={onClose} title="Suggest rules from a layout">
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-fg-muted text-pretty">Reads which rules an existing layout already obeys, using statistics only. Nothing is applied until you add a suggestion to the draft.</p>
        <div className="flex flex-wrap gap-2">
          <Button disabled={!latest || mineRun.isPending} onClick={() => latest && mineRun.mutate(latest.id)} title={latest ? undefined : 'Needs a finished run'}>
            {mineRun.isPending ? 'Reading…' : 'Latest run'}
          </Button>
          <Button disabled={mineFile.isPending} onClick={() => input.current?.click()}>
            {mineFile.isPending ? 'Reading…' : 'Reference workbook…'}
          </Button>
          <input ref={input} type="file" accept=".xlsx" hidden aria-label="Reference workbook" onChange={(e) => { const f = e.target.files?.[0]; if (f) mineFile.mutate(f); e.target.value = '' }} />
        </div>
        {error && (
          <p role="alert" className="text-[13px] text-danger">
            {describeError(error)}
          </p>
        )}
        {result && (
          <>
            <p className="text-xs text-fg-muted tnum">
              Read {result.signals} signals across {result.ciocs} CIOCs. {result.candidates.length} suggestions.
            </p>
            <ul className="max-h-72 overflow-auto overscroll-contain rounded-lg border border-border">
              {result.candidates.map((c: Candidate) => {
                const rule = asRules([c.rule as unknown as Record<string, unknown>])[0]
                const added = haveIds.has(rule.id)
                return (
                  <li key={c.id} className="flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium">{rule.name}</div>
                      <div className="text-xs text-fg-muted tnum">
                        {describeRule(rule)} · seen {c.support}× · {Math.round(c.confidence * 100)}%
                        {c.low_confidence && ' · low confidence'}
                      </div>
                    </div>
                    {c.already_enforced ? (
                      <span className="text-xs text-fg-subtle">Built in</span>
                    ) : (
                      <Button disabled={added} onClick={() => onAdd(rule)}>
                        {added ? 'Added' : 'Add'}
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
            {(result.notes ?? []).map((n) => (
              <p key={n} className="text-xs text-fg-subtle">{n}</p>
            ))}
          </>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Dialog>
  )
}
