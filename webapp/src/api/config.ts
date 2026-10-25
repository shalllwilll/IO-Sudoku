const KEY = 'apiBase'
const DEFAULT = 'http://localhost:8000'
const clean = (v: string) => v.trim().replace(/\/+$/, '')

function stored(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

/** The origin built into this build (VITE_API_BASE), before any override from Settings. */
export const DEFAULT_API_BASE = clean((import.meta.env.VITE_API_BASE as string | undefined)?.trim() || DEFAULT)

/** Backend origin, without a trailing slash. A value saved in Settings wins over the build default. */
export const API_BASE = clean(stored() || DEFAULT_API_BASE)

/** Saves an override (blank restores the default). The client is created at load, so callers reload afterwards. */
export function saveApiBase(value: string): void {
  try {
    if (clean(value) === '') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, clean(value))
  } catch {
    /* storage blocked: the override cannot be kept */
  }
}
