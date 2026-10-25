import { useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, inputClass } from '@/components/ui/Field'
import { buildRule, LEVELS, PRIMITIVES, PRIMITIVE_INFO, STRENGTHS, type Primitive, type Rule, type Strength } from '@/lib/rules'

function Form({ existing, onAdd, onClose }: { existing: Rule[]; onAdd: (r: Rule) => void; onClose: () => void }) {
  const [primitive, setPrimitive] = useState<Primitive>('capacity')
  const [name, setName] = useState('')
  const [scope, setScope] = useState('')
  const [strength, setStrength] = useState<Strength>('hard')
  const [values, setValues] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const info = PRIMITIVE_INFO[primitive]

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const built = buildRule({ primitive, name, scope, strength, values }, existing)
    if ('error' in built) return setError(built.error)
    onAdd(built.rule)
    onClose()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Rule type</span>
        <select
          className={inputClass}
          value={primitive}
          onChange={(e) => {
            setPrimitive(e.target.value as Primitive)
            setValues({})
            setError(null)
          }}
        >
          {PRIMITIVES.map((p) => (
            <option key={p} value={p}>
              {PRIMITIVE_INFO[p].label}
            </option>
          ))}
        </select>
        <span className="text-xs text-fg-subtle">{info.blurb}</span>
      </label>
      <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Keep analog loops together" autoFocus />
      <div className="grid grid-cols-2 gap-3">
        {info.params.map((p) =>
          p.kind === 'level' ? (
            <label key={p.key} className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium">{p.label}</span>
              <select className={inputClass} value={values[p.key] ?? ''} onChange={(e) => setValues({ ...values, [p.key]: e.target.value })}>
                <option value="">{p.key === 'level' ? 'Default' : 'Choose'}</option>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <Field key={p.key} label={p.label} inputMode={p.kind === 'number' ? 'numeric' : undefined} placeholder={p.placeholder} className="font-mono" value={values[p.key] ?? ''} onChange={(e) => setValues({ ...values, [p.key]: e.target.value })} />
          ),
        )}
      </div>
      <Field label="Applies to" hint="Optional scope, e.g. io_type = AIR and segregation_family in [A, B]. Empty means every signal." className="font-mono" value={scope} onChange={(e) => setScope(e.target.value)} />
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">Strength</span>
        <select className={inputClass} value={strength} onChange={(e) => setStrength(e.target.value as Strength)}>
          {STRENGTHS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <span className="text-xs text-fg-subtle">{STRENGTHS.find((s) => s.value === strength)?.blurb}</span>
      </label>
      {error && (
        <p role="alert" className="text-[13px] text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary">
          Add to draft
        </Button>
      </div>
    </form>
  )
}

export function RuleEditor({ open, existing, onAdd, onClose }: { open: boolean; existing: Rule[]; onAdd: (r: Rule) => void; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a rule">
      {open && <Form existing={existing} onAdd={onAdd} onClose={onClose} />}
    </Dialog>
  )
}
