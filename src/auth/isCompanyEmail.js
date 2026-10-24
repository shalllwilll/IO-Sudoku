// Convenience check only. The backend MUST enforce the company-domain rule (MI-2, MI-3):
// anything in the browser can be bypassed.

/**
 * True when `email` has exactly one "@", a non-empty local part, and an ASCII host
 * that equals one of `domains` (exact match, so subdomain tricks and look-alikes fail).
 */
export function isCompanyEmail(email, domains) {
  if (typeof email !== "string" || !Array.isArray(domains) || domains.length === 0) return false;
  const value = email.trim().toLowerCase();
  const parts = value.split("@");
  if (parts.length !== 2) return false;
  const [local, host] = parts;
  if (!local || !host) return false;
  if (!/^[a-z0-9.-]+$/.test(host)) return false; // ASCII only: rejects Cyrillic look-alikes
  return domains.map((d) => d.trim().toLowerCase()).includes(host);
}

/** Basic shape check used before any request is made. */
export function looksLikeEmail(email) {
  return typeof email === "string" && /^[^@\s]+@[^@\s]+$/.test(email.trim());
}
