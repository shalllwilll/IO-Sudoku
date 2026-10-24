// Runtime configuration, read once from Vite's import.meta.env.
// Only VITE_API_MODE and VITE_API_BASE_URL select behaviour. No secret ever belongs in a VITE_ variable.

export const MODES = ["mock", "live"];

export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Resolves the API mode. Missing means mock. Anything else than mock or live throws. */
export function resolveMode(raw) {
  const mode = (raw ?? "").trim().toLowerCase() || "mock";
  if (!MODES.includes(mode)) {
    throw new ConfigError(`Unknown VITE_API_MODE "${raw}". Use "mock" or "live".`);
  }
  return mode;
}

/** Parses the comma-separated company domain allow-list. Empty means sign-in fails closed. */
export function parseDomains(raw) {
  return (raw ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean);
}

export function parseMaxUploadMb(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : 25;
}

const env = import.meta.env ?? {};

export const config = {
  mode: resolveMode(env.VITE_API_MODE),
  apiBase: (env.VITE_API_BASE_URL ?? "").replace(/\/$/, ""),
  allowedEmailDomains: parseDomains(env.VITE_ALLOWED_EMAIL_DOMAINS),
  maxUploadMb: parseMaxUploadMb(env.VITE_MAX_UPLOAD_MB),
  maxUploadFiles: 10,
  sponsorLogo: env.VITE_SPONSOR_LOGO || "",
};
