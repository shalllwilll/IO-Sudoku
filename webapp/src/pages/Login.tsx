import { motion } from 'motion/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ThemeToggle } from '@/components/ThemeToggle'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { IO_BG } from '@/components/charm/kinds'
import { cn } from '@/lib/cn'
import { BASEPLATES, CHANNELS, IO_TYPES } from '@/preview/mock'

type Role = 'engineer' | 'reviewer'

// Entrance for an infrequent view: 100ms stagger, 300ms ease-out, 12px rise, 4px blur.
const chunk = (i: number) => ({
  initial: { opacity: 0, y: 12, filter: 'blur(4px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.3, ease: 'easeOut' as const, delay: i * 0.1 },
})

/** One CIOC: 8 baseplates of 12 channels, revealed on a diagonal. */
function CiocMotif() {
  return (
    <div className="grid gap-1.5" role="img" aria-label="One CIOC: eight baseplates of twelve channels">
      {Array.from({ length: BASEPLATES }, (_, bp) => (
        <div key={bp} className="flex gap-1.5">
          {Array.from({ length: CHANNELS }, (_, ch) => {
            const filled = (bp * 7 + ch * 3) % 11 > 2
            const io = IO_TYPES[(bp + ch * 2) % IO_TYPES.length]
            return (
              <motion.span
                key={ch}
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, ease: 'easeOut', delay: 0.3 + (bp + ch) * 0.025 }}
                className={cn('size-6 rounded-[6px]', filled ? IO_BG[io] : 'border border-dashed border-border-strong')}
              />
            )
          })}
        </div>
      ))}
    </div>
  )
}

export default function Login() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('engineer')

  return (
    <div className="grid min-h-dvh grid-cols-1 bg-bg lg:grid-cols-[minmax(420px,520px)_1fr]">
      <div className="flex flex-col px-8 py-8 sm:px-14">
        <div className="flex items-center justify-between">
          <span className="text-[13px] font-semibold tracking-tight">IO Signal Sudoku</span>
          <ThemeToggle />
        </div>
        <form
          className="my-auto flex max-w-sm flex-col gap-6 py-12"
          onSubmit={(e) => {
            e.preventDefault()
            nav('/run')
          }}
        >
          <motion.div {...chunk(0)} className="flex flex-col gap-2">
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-balance">
              Every signal, in its place.
            </h1>
            <p className="text-fg-muted text-pretty">
              Allocate field signals to cabinets, CIOCs and CHARMs, and see every assumption behind the result.
            </p>
          </motion.div>
          <motion.label {...chunk(1)} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Name or email</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Priya Nair"
              className="h-10 rounded-md border border-border-strong bg-surface-1 px-3 text-[14px] outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-fg-subtle focus:border-accent focus:ring-2 focus:ring-accent-soft"
            />
          </motion.label>
          <motion.div {...chunk(2)} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Role</span>
            <Segmented<Role>
              label="Role"
              value={role}
              onChange={setRole}
              options={[
                { value: 'engineer', label: 'Engineer', hint: 'Edits mappings, rules, answers TQs' },
                { value: 'reviewer', label: 'Reviewer', hint: 'Reads results and reports' },
              ]}
            />
          </motion.div>
          <motion.div {...chunk(3)} className="flex flex-col gap-3">
            <Button variant="primary" type="submit" className="h-10 text-[14px]">
              Continue
            </Button>
            <p className="text-xs text-fg-subtle text-pretty">
              Demo sign-in. There is no password; your name and role are kept on this device only.
            </p>
          </motion.div>
        </form>
      </div>
      <div className="relative hidden items-center justify-center overflow-hidden border-l border-border bg-surface-1 lg:flex">
        <div className="flex flex-col gap-6">
          <CiocMotif />
          <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-2 text-xs text-fg-muted">
            <span>One CIOC: 8 baseplates × 12 channels</span>
            <span className="flex gap-3">
              {IO_TYPES.map((t) => (
                <span key={t} className="flex items-center gap-1.5 font-mono">
                  <span className={cn('size-2 rounded-sm', IO_BG[t])} />
                  {t}
                </span>
              ))}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
