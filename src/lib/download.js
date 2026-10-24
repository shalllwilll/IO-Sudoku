// Saves a Blob as a file. Revokes the object URL right after the click is dispatched, so
// downloading many files in a row does not grow memory (T-7.4-11).

// eslint-disable-next-line no-control-regex -- control characters are exactly what this strips
const UNSAFE = /[\\/:*?"<>|\u0000-\u001f]/g;

/** Strips path separators and control characters from a name before it is offered to the OS. */
export function sanitizeFilename(name, fallback = "download") {
  const cleaned = String(name ?? "")
    .replace(UNSAFE, "_")
    .trim();
  return cleaned || fallback;
}

export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = sanitizeFilename(filename);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the click a tick to start the save before the URL is freed.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Writes `rows` (array of arrays) as a CSV download. */
export async function saveCsv(rows, filename) {
  const { toCsv } = await import("./csv.js");
  saveBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), filename);
}

export function saveJson(data, filename) {
  saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), filename);
}
