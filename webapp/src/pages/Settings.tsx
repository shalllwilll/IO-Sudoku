import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { describeError } from '@/api/errors'
import { API_BASE, DEFAULT_API_BASE, saveApiBase } from '@/api/config'
import { useAiStatus, useHealth } from '@/api/queries'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'
import { getTheme, setTheme, type Theme } from '@/lib/theme'

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-1 p-5 shadow-card" aria-label={title}>
    <h2 className="text-[13px] font-medium">{title}</h2>
    {children}
  </section>
)

const Dot = ({ ok }: { ok: boolean }) => <span className={cn('size-2 shrink-0 rounded-full', ok ? 'bg-success' : 'bg-danger')} />

export default function Settings() {
  const qc = useQueryClient()
  const health = useHealth()
  const ai = useAiStatus()
  const [url, setUrl] = useState(API_BASE)
  const [theme, setT] = useState<Theme>(getTheme)
  const invalid = !/^https?:\/\/[^\s/]+/i.test(url.trim()) && url.trim() !== ''
  const changed = url.trim().replace(/\/+$/, '') !== API_BASE

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 p-8">
      <h1 className="text-lg font-semibold tracking-tight">Settings</h1>

      <Card title="Backend">
        <p className="flex items-center gap-2 text-[13px]" role="status">
          {health.isLoading ? 'Checking…' : <><Dot ok={health.isSuccess} />{health.isSuccess ? 'Connected' : describeError(health.error)}</>}
        </p>
        <Field label="API address" className="font-mono" value={url} onChange={(e) => setUrl(e.target.value)} hint={invalid ? 'Enter a full address such as http://localhost:8000' : `Build default: ${DEFAULT_API_BASE}`} aria-invalid={invalid} />
        <div className="flex gap-2">
          <Button variant="primary" disabled={invalid || !changed} onClick={() => { saveApiBase(url); window.location.reload() }}>
            Save and reload
          </Button>
          <Button variant="ghost" disabled={API_BASE === DEFAULT_API_BASE} onClick={() => { saveApiBase(''); window.location.reload() }}>
            Use build default
          </Button>
        </div>
      </Card>

      <Card title="AI assistant">
        <p className="flex items-center gap-2 text-[13px]">
          <Dot ok={ai.data?.ai_available === true} />
          {ai.isLoading ? 'Checking…' : ai.data?.ai_available ? `Available${ai.data.models?.length ? `: ${ai.data.models.join(', ')}` : ''}` : 'Not configured on this backend'}
        </p>
        <p className="text-xs text-fg-muted text-pretty">AI only suggests and explains. Nothing it proposes is applied until you confirm, and every other feature works without it.</p>
        <Button className="self-start" onClick={() => void qc.invalidateQueries({ queryKey: ['ai-status'] })}>Check again</Button>
      </Card>

      <Card title="Appearance">
        <Segmented<Theme> label="Theme" value={theme} onChange={(t) => { setTheme(t); setT(t) }} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
      </Card>

      <Card title="About this build">
        <ul className="list-disc space-y-1 pl-4 text-xs text-fg-muted">
          <li className="text-pretty">Sign-in is a demo: your name and role are stored on this device only and there is no password or access control.</li>
          <li className="text-pretty">The 3D plant view is not connected yet; the 2D layout shows the same data.</li>
          <li className="text-pretty">TQ answers waiting for a re-run are tracked in this browser, not on the server.</li>
        </ul>
      </Card>
    </div>
  )
}
