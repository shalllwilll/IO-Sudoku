import { FileSpreadsheet, Trash2, Upload as UploadIcon } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useDeleteUpload, useMapping, useUploadFile, useUploads, useValues, type Upload } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { importHealth } from '@/lib/importHealth'
import { checkFile } from '@/lib/upload'

const fmtSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

function UploadRow({ u, onDelete, busy }: { u: Upload; onDelete: () => void; busy: boolean }) {
  const [confirm, setConfirm] = useState(false)
  return (
    <li className="rounded-lg border border-border bg-surface-1 p-4 shadow-card">
      <div className="flex items-center gap-3">
        <FileSpreadsheet size={18} strokeWidth={1.75} className="text-fg-muted" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{u.name}</div>
          <div className="text-xs text-fg-muted tnum">
            {fmtSize(u.size)} · uploaded {new Date(u.created_at).toLocaleString()}
          </div>
        </div>
        {confirm ? (
          <div className="flex items-center gap-2 text-[13px]">
            <span className="text-fg-muted">Remove this file and its mapping?</span>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Keep
            </Button>
            <Button variant="secondary" className="text-danger" disabled={busy} onClick={onDelete}>
              Remove
            </Button>
          </div>
        ) : (
          <Button variant="ghost" aria-label={`Remove ${u.name}`} className="size-9 px-0" onClick={() => setConfirm(true)}>
            <Trash2 size={15} strokeWidth={1.75} />
          </Button>
        )}
      </div>
      {(u.sheets?.length ?? 0) > 0 && (
        <table className="mt-3 w-full text-left text-[13px]">
          <thead className="text-xs text-fg-subtle">
            <tr>
              <th className="py-1 font-normal">Sheet</th>
              <th className="py-1 text-right font-normal">Rows</th>
              <th className="py-1 text-right font-normal">Header row</th>
              <th className="py-1 text-right font-normal">Deleted</th>
              <th className="py-1 text-right font-normal">Out of scope</th>
            </tr>
          </thead>
          <tbody>
            {u.sheets!.map((s, i) => (
              <tr key={`${s.sheet}-${i}`} className="border-t border-border">
                <td className="py-1.5 font-mono text-xs">{s.sheet ?? '–'}</td>
                <td className="py-1.5 text-right tnum">{s.rows}</td>
                <td className="py-1.5 text-right tnum">{s.header_row ?? '–'}</td>
                <td className="py-1.5 text-right tnum">{s.deleted}</td>
                <td className="py-1.5 text-right tnum">{s.out_of_scope}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </li>
  )
}

function Check({ pid }: { pid: string }) {
  const mapping = useMapping(pid)
  const values = useValues(pid)
  const h = importHealth(mapping.data, values.data)
  if (!mapping.data || !values.data) return null
  const rows = [
    { to: 'map', title: 'Columns', ok: h.missing.length === 0, text: h.missing.length ? `Required fields not matched: ${h.missing.join(', ')}` : 'Every required column was recognised', action: h.missing.length ? 'Fix' : 'Review' },
    { to: 'values', title: 'Values', ok: h.open === 0, text: h.open ? `${h.open} unrecognised ${h.open === 1 ? 'value needs' : 'values need'} a decision` : 'Every value was recognised', action: h.open ? 'Decide' : 'Review' },
  ]
  return (
    <section aria-label="Import check" className="rounded-lg border border-border bg-surface-1 shadow-card">
      <ul>
        {rows.map((r) => (
          <li key={r.to} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
            <span className={cn('size-2 shrink-0 rounded-full', r.ok ? 'bg-success' : 'bg-warning')} />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium">{r.title}</div>
              <div className="text-xs text-fg-muted text-pretty">{r.text}</div>
            </div>
            <Link to={`/projects/${pid}/${r.to}`} className="text-[13px] text-accent hover:underline">{r.action}</Link>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-3 border-t border-border px-4 py-3">
        {!h.ok && <span className="text-xs text-fg-muted">You can continue; open items become questions after the run.</span>}
        <Link to={`/projects/${pid}/rules`} className="inline-flex h-9 items-center rounded-md bg-accent px-3.5 text-[13px] font-medium text-accent-fg shadow-card transition-[background-color] duration-150 ease-out hover:bg-accent-strong">Continue to Rules</Link>
      </div>
    </section>
  )
}

export default function Data() {
  const { pid = '' } = useParams()
  const uploads = useUploads(pid)
  const upload = useUploadFile(pid)
  const del = useDeleteUpload(pid)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const send = (files: FileList | File[]) => {
    const list = Array.from(files)
    setProblem(null)
    for (const f of list) {
      const bad = checkFile(f)
      if (bad) return setProblem(`${f.name}: ${bad}`)
    }
    list.forEach((f) =>
      upload.mutate(f, { onError: (e) => setProblem(`${f.name}: ${describeError(e)}`) }),
    )
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    send(e.dataTransfer.files)
  }

  if (uploads.isError) return <ErrorPanel error={uploads.error} onRetry={() => void uploads.refetch()} />

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Import</h1>
        <p className="mt-1 text-[13px] text-fg-muted text-pretty">Upload the signal list workbook. Columns and values are matched for you; only what is unclear is asked.</p>
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center transition-[border-color,background-color] duration-150 ease-out',
          over ? 'border-accent bg-accent-soft' : 'border-border-strong bg-surface-1',
        )}
      >
        <UploadIcon size={20} strokeWidth={1.75} className="text-fg-muted" />
        <p className="text-[13px]">Drop an .xlsx workbook here</p>
        <p className="text-xs text-fg-subtle">Up to 25 MB. Nothing leaves this machine.</p>
        <Button variant="primary" disabled={upload.isPending} onClick={() => input.current?.click()}>
          {upload.isPending ? 'Reading workbook…' : 'Choose file'}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".xlsx"
          multiple
          hidden
          aria-label="Workbook file"
          onChange={(e) => {
            if (e.target.files) send(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
      {problem && (
        <p role="alert" className="text-[13px] text-danger">
          {problem}
        </p>
      )}
      {uploads.isPending ? (
        <p className="text-[13px] text-fg-muted">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {uploads.data.map((u) => (
            <UploadRow key={u.id} u={u} busy={del.isPending} onDelete={() => del.mutate(u.id)} />
          ))}
        </ul>
      )}
      {(uploads.data?.length ?? 0) > 0 && <Check pid={pid} />}
    </div>
  )
}
