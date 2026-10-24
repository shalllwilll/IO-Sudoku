/** Accepts only same-origin paths: one leading "/", never "//" or a backslash. */
export function safeReturnTo(value, fallback = "/projects") {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  if ([...value].some((ch) => ch.charCodeAt(0) < 32)) return fallback;
  return value;
}
