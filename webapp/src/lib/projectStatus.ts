import type { Project } from '@/api/queries'

/** A project's state, derived from its upload and run counts. */
export function projectStatus(p: Pick<Project, 'uploads' | 'runs'>): { label: string; tone: 'muted' | 'warn' | 'ok' } {
  if (p.uploads === 0) return { label: 'Needs data', tone: 'warn' }
  if (p.runs === 0) return { label: 'Ready to run', tone: 'muted' }
  return { label: `${p.runs} ${p.runs === 1 ? 'run' : 'runs'}`, tone: 'ok' }
}
