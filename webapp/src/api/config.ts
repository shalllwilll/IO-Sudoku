const raw = import.meta.env.VITE_API_BASE as string | undefined
/** Backend origin, without a trailing slash. Routes already start with /api. */
export const API_BASE = (raw && raw.trim() !== '' ? raw : 'http://localhost:8000').replace(/\/+$/, '')
