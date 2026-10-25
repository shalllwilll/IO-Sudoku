import { Download, Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import type { ReportDoc } from '@/api/queries'

/** A report document laid out for the screen and for printing (Print, then Save as PDF). */
export function ReportView({ doc, xlsx, back }: { doc: ReportDoc; xlsx: string; back?: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-[980px] p-8 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center gap-2 print:hidden">
        {back}
        <button type="button" onClick={() => window.print()} className="ml-auto inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3.5 text-[13px] font-medium transition-[background-color,scale] duration-150 ease-out hover:bg-surface-3 active:scale-[0.96]">
          <Printer size={14} strokeWidth={1.75} /> Print or save as PDF
        </button>
        <a href={xlsx} className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface-2 px-3.5 text-[13px] font-medium transition-[background-color,scale] duration-150 ease-out hover:bg-surface-3 active:scale-[0.96]">
          <Download size={14} strokeWidth={1.75} /> Download .xlsx
        </a>
      </div>
      <header className="mb-6 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
        {doc.subtitle && <p className="mt-1 text-fg-muted">{doc.subtitle}</p>}
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[13px]">
          {(doc.meta ?? []).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-muted">{k}</dt>
              <dd className="font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
      </header>
      {(doc.sections ?? []).map((s, i) => (
        <section key={i} className="mb-8 break-inside-avoid-page">
          <h2 className="mb-2 text-[15px] font-semibold tracking-tight">{s.heading}</h2>
          {(s.text ?? []).map((t, j) => (
            <p key={j} className="mb-2 text-[13px] text-fg-muted text-pretty">{t}</p>
          ))}
          {(s.figures ?? []).length > 0 && (
            <dl className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(s.figures ?? []).map((f) => (
                <div key={f.label} className="rounded-lg border border-border p-3">
                  <dt className="text-xs text-fg-muted">{f.label}</dt>
                  <dd className="text-lg font-semibold tnum">{f.value}</dd>
                  {f.hint && <dd className="text-xs text-fg-subtle">{f.hint}</dd>}
                </div>
              ))}
            </dl>
          )}
          {(s.tables ?? []).map((t, j) => (
            <div key={j} className="mb-4">
              {t.title && <h3 className="mb-1 text-xs font-medium text-fg-muted">{t.title}</h3>}
              <table className="w-full border-collapse text-left text-[12px]">
                <thead>
                  <tr className="border-b border-border-strong text-fg-muted">
                    {t.columns.map((c) => (
                      <th key={c} className="px-2 py-1.5 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {t.rows.map((r, k) => (
                    <tr key={k} className="break-inside-avoid border-b border-border">
                      {r.map((c, m) => (
                        <td key={m} className="px-2 py-1.5 align-top tnum">{c ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {t.rows.length === 0 && <p className="py-2 text-xs text-fg-subtle">None.</p>}
            </div>
          ))}
        </section>
      ))}
    </article>
  )
}
