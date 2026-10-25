import type { MappingSheet } from '@/api/queries'

/** field -> chosen source column ('' = not mapped) */
export type Selection = Record<string, string>

export const sheetKey = (s: Pick<MappingSheet, 'file' | 'sheet'>) => `${s.file}::${s.sheet ?? ''}`

/** What the backend currently resolves for a sheet: confirmed choices win over detected matches. */
export function currentSelection(sheet: MappingSheet, fields: string[], confirmed: Record<string, string> = {}): Selection {
  const out: Selection = {}
  for (const f of fields) {
    const c = confirmed[f]
    out[f] = c && sheet.columns.includes(c) ? c : (sheet.matches[f]?.column ?? '')
  }
  return out
}

/** Build the PUT body. Every mapped field of every sheet is confirmed; a file shared by sheets takes the first sheet that maps the field. */
export function toConfirmed(sheets: MappingSheet[], selections: Record<string, Selection>): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {}
  for (const s of sheets) {
    const sel = selections[sheetKey(s)] ?? {}
    const file = (out[s.file] ??= {})
    for (const [field, col] of Object.entries(sel)) if (col && !(field in file)) file[field] = col
  }
  return out
}

export const missingRequired = (sel: Selection, required: string[]) => required.filter((f) => !sel[f])

/** Columns chosen for more than one field in a sheet, which is almost always a mistake. */
export function duplicateColumns(sel: Selection): Record<string, string[]> {
  const byCol: Record<string, string[]> = {}
  for (const [f, c] of Object.entries(sel)) if (c) (byCol[c] ??= []).push(f)
  return Object.fromEntries(Object.entries(byCol).filter(([, fs]) => fs.length > 1))
}
