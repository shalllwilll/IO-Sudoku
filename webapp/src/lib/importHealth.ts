import type { MappingOut, ValuesOut } from '@/api/queries'
import { currentSelection, missingRequired } from '@/lib/mapping'
import { undecided } from '@/lib/values'

export interface ImportHealth {
  /** Required fields no column is mapped to, across all sheets. */
  missing: string[]
  /** Unrecognised values still waiting for a decision. */
  open: number
  ok: boolean
}

export function importHealth(mapping: MappingOut | undefined, values: ValuesOut | undefined): ImportHealth {
  const missing = mapping
    ? [...new Set(mapping.sheets.flatMap((s) => missingRequired(currentSelection(s, mapping.fields, mapping.confirmed[s.file]), mapping.required)))]
    : []
  const open = values ? undecided(values.unknown, values.overrides).length : 0
  return { missing, open, ok: missing.length === 0 && open === 0 }
}
