import { AlertTriangle, Check, ChevronDown, Info, Lock, Plus, Trash2, Wand2, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { describeError } from '@/api/errors'
import { useAiStatus, useLint, usePutRules, useRules, type DryRun, type Finding } from '@/api/queries'
import { ErrorPanel } from '@/components/ErrorView'
import { DescribeRule } from '@/components/rules/DescribeRule'
import { MineDialog } from '@/components/rules/MineDialog'
import { RuleEditor } from '@/components/rules/RuleEditor'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'
import { PRESETS } from '@/lib/presets'
import { asRules, byStrength, describeRule, nextRuleId, PRIMITIVE_INFO, STRENGTHS, type Rule, type Strength } from '@/lib/rules'

const SEVERITY = {
  error: { icon: XCircle, cls: 'text-danger', label: 'Error' },
  warning: { icon: AlertTriangle, cls: 'text-warning', label: 'Warning' },
  info: { icon: Info, cls: 'text-fg-muted', label: 'Note' },
} as const

function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn('relative h-5 w-9 shrink-0 rounded-full transition-[background-color] duration-150 ease-out disabled:cursor-not-allowed disabled:opacity-50', on ? 'bg-accent' : 'bg-surface-3')}
    >
      <span className={cn('absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-card transition-[translate] duration-150 ease-out', on && 'translate-x-4')} />
    </button>
  )
}

function RuleRow({ rule, findings, dry, onChange, onDelete }: { rule: Rule; findings: Finding[]; dry?: DryRun; onChange: (r: Rule) => void; onDelete: () => void }) {
  const locked = rule.builtin !== null
  return (
    <li className={cn('flex flex-col gap-1.5 border-b border-border px-4 py-3 last:border-0', !rule.enabled && 'opacity-60')}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium">{rule.name || rule.id}</span>
            <span className="font-mono text-[11px] text-fg-subtle">{rule.id}</span>
            {locked ? (
              <span className="flex items-center gap-1 rounded bg-surface-3 px-1.5 text-[11px] text-fg-muted" title="The validator always enforces this invariant">
                <Lock size={10} strokeWidth={2} /> Built in
              </span>
            ) : rule.primitive ? (
              <span className="rounded bg-surface-3 px-1.5 text-[11px] text-fg-muted">{PRIMITIVE_INFO[rule.primitive].label}</span>
            ) : (
              <span className="rounded bg-warning/15 px-1.5 text-[11px] text-warning">Not enforced</span>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-fg-muted text-pretty">{describeRule(rule)}</p>
        </div>
        {dry && !locked && (
          <span className="hidden text-xs text-fg-muted tnum md:block" title="Signals and cable blocks this rule's scope touches in the current data">
            {dry.matched_signals} signals · {dry.affected_blocks} blocks
          </span>
        )}
        {!locked && (
          <select
            aria-label={`Strength of ${rule.id}`}
            value={rule.strength}
            onChange={(e) => onChange({ ...rule, strength: e.target.value as Strength })}
            className="h-8 rounded-md border border-border-strong bg-surface-1 px-2 text-[13px]"
          >
            {STRENGTHS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        )}
        <Toggle on={rule.enabled} disabled={locked} label={`${rule.enabled ? 'Disable' : 'Enable'} ${rule.id}`} onChange={(v) => onChange({ ...rule, enabled: v })} />
        {!locked && (
          <button type="button" aria-label={`Delete ${rule.id}`} className="grid size-8 place-items-center rounded-md text-fg-muted transition-[background-color,color] duration-150 ease-out hover:bg-surface-2 hover:text-danger" onClick={onDelete}>
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        )}
      </div>
      {dry?.error && <p className="text-xs text-danger">{dry.error}</p>}
      {findings.map((f, i) => {
        const s = SEVERITY[f.severity as keyof typeof SEVERITY] ?? SEVERITY.info
        return (
          <p key={i} className={cn('flex items-start gap-1.5 text-xs', s.cls)}>
            <s.icon size={13} strokeWidth={1.75} className="mt-px shrink-0" />
            <span className="text-pretty">
              <span className="sr-only">{s.label}: </span>
              {f.message}
            </span>
          </p>
        )
      })}
    </li>
  )
}

const SECTIONS = [
  { key: 'locked', title: 'Locked', blurb: 'Built in. The validator always enforces these.', pick: (g: Record<Strength, Rule[]>) => g.hard.filter((r) => r.builtin !== null) },
  { key: 'hard', title: 'Enforced', blurb: 'Never broken. A layout that breaks one is rejected.', pick: (g: Record<Strength, Rule[]>) => g.hard.filter((r) => r.builtin === null) },
  { key: 'soft', title: 'Preferred', blurb: 'Followed where possible; a break is reported.', pick: (g: Record<Strength, Rule[]>) => g.soft },
  { key: 'advisory', title: 'Advisory', blurb: 'Recorded and checked, never changes the layout.', pick: (g: Record<Strength, Rule[]>) => g.advisory },
]

export default function Rules() {
  const { pid = '' } = useParams()
  const location = useLocation()
  const rules = useRules(pid)
  const put = usePutRules(pid)
  const ai = useAiStatus()
  const [edit, setEdit] = useState<Rule[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [mining, setMining] = useState(false)
  const [confirmPreset, setConfirmPreset] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [ruleDetails, setRuleDetails] = useState(false)
  const initialRule = typeof (location.state as { initialRule?: unknown } | null)?.initialRule === 'string'
    ? (location.state as { initialRule: string }).initialRule
    : ''

  const server = useMemo(() => (rules.data ? asRules(rules.data.rules) : []), [rules.data])
  const current = edit ?? server
  const lint = useLint(pid, rules.data ? (current as unknown as Record<string, unknown>[]) : undefined)

  if (rules.isError) return <ErrorPanel error={rules.error} onRetry={() => void rules.refetch()} />
  if (!rules.data) return <p className="p-8 text-[13px] text-fg-muted">Loading rules…</p>

  const data = rules.data
  const dirty = edit !== null
  const groups = byStrength(current)
  const findings = lint.data?.findings ?? []
  const forRule = (id: string) => findings.filter((f) => f.rule_id === id)
  const general = findings.filter((f) => !current.some((r) => r.id === f.rule_id))
  const errors = findings.filter((f) => f.severity === 'error').length
  const change = (next: Rule[]) => {
    setSaved(false)
    setEdit(next)
    setRuleDetails(true)
  }
  const replace = (r: Rule) => change(current.map((x) => (x.id === r.id ? r : x)))
  const add = (r: Rule) => change([...current, current.some((x) => x.id === r.id) ? { ...r, id: nextRuleId(current, r.primitive ?? 'capacity') } : r])
  const switchPreset = (preset: string) => {
    if (preset === data.preset && !data.custom && !dirty) return
    if (dirty || data.custom) return setConfirmPreset(preset)
    put.mutate({ preset })
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-8">
      <div className="flex items-start gap-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Rules</h1>
          <p className="mt-1 text-[13px] text-fg-muted text-pretty">What the layout must and should respect. Say it in plain words, start from a preset, or learn it from an issued layout.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {saved && !dirty && (
            <span className="flex items-center gap-1.5 text-[13px] text-success">
              <Check size={14} strokeWidth={2} /> Saved
            </span>
          )}
          {dirty && (
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Discard
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty || put.isPending || errors > 0}
            title={errors > 0 ? 'Fix the errors first' : undefined}
            onClick={() => put.mutate({ rules: current as unknown as Record<string, unknown>[] }, { onSuccess: () => { setSaved(true); setEdit(null) } })}
          >
            {put.isPending ? 'Saving…' : 'Save rules'}
          </Button>
        </div>
      </div>

      <DescribeRule pid={pid} aiOn={ai.data?.ai_available === true} initialText={initialRule} disabled={dirty ? 'Save or discard your edits below first, then describe the next rule.' : undefined} />

      <section aria-label="Advanced rule tools" className="rounded-lg border border-border bg-surface-1 shadow-card">
        <button type="button" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left transition-[background-color] duration-150 ease-out hover:bg-surface-2">
          <span className="text-[13px] font-medium">More ways to add or configure rules</span>
          {(data.custom || dirty) && <span className="rounded bg-warning/15 px-1.5 text-[11px] text-warning">{dirty ? 'Edited, not saved' : 'Customised'}</span>}
          <ChevronDown size={15} strokeWidth={1.75} className={cn('ml-auto text-fg-muted transition-[rotate] duration-150 ease-out', advanced && 'rotate-180')} />
        </button>
        {advanced && <div className="flex flex-col gap-4 border-t border-border p-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Start from a preset</span>
        <Segmented<string>
          label="Rule preset"
          value={data.custom || dirty ? '' : data.preset}
          onChange={switchPreset}
          options={data.presets.map((p) => ({ value: p, label: PRESETS.find((x) => x.value === p)?.label ?? p, hint: PRESETS.find((x) => x.value === p)?.hint }))}
        />
        </div>
        {confirmPreset && (
          <div role="alertdialog" className="flex flex-wrap items-center gap-3 rounded-md border border-border-strong bg-surface-1 px-3 py-2 text-[13px]">
            <span className="text-pretty">Switching to {PRESETS.find((x) => x.value === confirmPreset)?.label ?? confirmPreset} discards your custom rules.</span>
            <Button variant="ghost" className="ml-auto" onClick={() => setConfirmPreset(null)}>
              Keep mine
            </Button>
            <Button
              onClick={() => put.mutate({ preset: confirmPreset }, { onSuccess: () => { setEdit(null); setConfirmPreset(null) } })}
            >
              Switch preset
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button icon={<Plus size={15} strokeWidth={1.75} />} onClick={() => setAdding(true)}>Add rule with the form</Button>
          <Button icon={<Wand2 size={15} strokeWidth={1.75} />} onClick={() => setMining(true)}>Learn from an issued layout</Button>
        </div>
      </div>}</section>

      {put.isError && (
        <p role="alert" className="text-[13px] text-danger">
          {describeError(put.error)}
        </p>
      )}
      {lint.isError && (
        <p role="alert" className="text-[13px] text-danger">
          {describeError(lint.error)}
        </p>
      )}
      {general.length > 0 && (
        <ul className="rounded-lg border border-border bg-surface-1 p-3 text-[13px]">
          {general.map((f, i) => (
            <li key={i} className="text-fg-muted">
              {f.message}
            </li>
          ))}
        </ul>
      )}

      <section aria-label="Current rule set" className="rounded-lg border border-border bg-surface-1 shadow-card">
        <button type="button" aria-expanded={ruleDetails} onClick={() => setRuleDetails((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left transition-[background-color] duration-150 ease-out hover:bg-surface-2">
          <span className="text-[13px] font-medium">Current rule set</span>
          <span className="text-xs text-fg-muted tnum">{current.length} rules · {groups.hard.length} enforced</span>
          <ChevronDown size={15} strokeWidth={1.75} className={cn('ml-auto text-fg-muted transition-[rotate] duration-150 ease-out', ruleDetails && 'rotate-180')} />
        </button>
        {ruleDetails && <div className="border-t border-border p-4">{SECTIONS.map(({ key, title, blurb, pick }) => {
        const rows = pick(groups)
        return rows.length === 0 ? null : (
          <section key={key} aria-label={`${title} rules`}>
            <div className="mb-2 flex items-baseline gap-2">
              <h2 className="text-[13px] font-medium">{title}</h2>
              <span className="text-xs text-fg-subtle">{blurb}</span>
            </div>
            <ul className="overflow-hidden rounded-lg border border-border bg-surface-1 shadow-card">
              {rows.map((r) => (
                <RuleRow key={r.id} rule={r} findings={forRule(r.id)} dry={lint.data?.dry_run?.find((d) => d.rule_id === r.id)} onChange={replace} onDelete={() => change(current.filter((x) => x.id !== r.id))} />
              ))}
            </ul>
          </section>
        )
        })}</div>}
      </section>

      <div className="flex flex-wrap gap-2">
        <Link to={`/projects/${pid}/run`} className="ml-auto self-center text-[13px] text-accent hover:underline">
          Continue to Run
        </Link>
      </div>
      <RuleEditor open={adding} existing={current} onAdd={add} onClose={() => setAdding(false)} />
      <MineDialog pid={pid} open={mining} onClose={() => setMining(false)} onAdd={add} haveIds={new Set(current.map((r) => r.id))} />
    </div>
  )
}
