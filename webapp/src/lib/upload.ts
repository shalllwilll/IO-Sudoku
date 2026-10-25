export const MAX_BYTES = 25 * 1024 * 1024

/** Client-side pre-check so the common mistakes get an instant message; the server stays authoritative. */
export function checkFile(file: Pick<File, 'name' | 'size'>): string | null {
  if (!/\.xlsx$/i.test(file.name)) return 'Only .xlsx workbooks are accepted.'
  if (file.size === 0) return 'The file is empty.'
  if (file.size > MAX_BYTES) return 'The file is larger than the 25 MB limit.'
  return null
}
