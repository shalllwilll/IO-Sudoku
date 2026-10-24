// Client-side file check. A convenience only: the backend validates again.
export const ALLOWED_EXTENSIONS = [".xlsx", ".xlsm", ".xls", ".csv"];

const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0];

const startsWith = (bytes, magic) => magic.every((value, index) => bytes[index] === value);

export function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "" : name.slice(dot).toLowerCase();
}

/** Resolves { ok: true } or { ok: false, reason }. Reads only the first 8 bytes (and 4 KB of a CSV). */
export async function validateFile(file, { maxMb = 25 } = {}) {
  const ext = extensionOf(file.name);
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { ok: false, reason: `Unsupported type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.` };
  }
  if (file.size === 0) return { ok: false, reason: "The file is empty." };
  if (file.size > maxMb * 1024 * 1024) return { ok: false, reason: `The file is over the ${maxMb} MB limit.` };
  const bytes = new Uint8Array(await file.slice(0, ext === ".csv" ? 4096 : 8).arrayBuffer());
  if (ext === ".xlsx" || ext === ".xlsm") {
    if (!startsWith(bytes, ZIP)) return { ok: false, reason: "The content is not a valid workbook." };
  } else if (ext === ".xls") {
    if (!startsWith(bytes, OLE)) return { ok: false, reason: "The content is not a valid workbook." };
  } else if (bytes.includes(0)) {
    return { ok: false, reason: "The content is not valid CSV text." };
  }
  return { ok: true };
}

/**
 * Merges newly chosen files into the list: sorted by name, duplicates (same name and size)
 * ignored, capped at maxFiles. Returns { files, notes }.
 */
export function mergeFiles(existing, incoming, maxFiles = 10) {
  const notes = [];
  const files = [...existing];
  for (const item of incoming) {
    if (files.some((f) => f.name === item.name && f.size === item.size)) {
      notes.push(`${item.name} is already in the list.`);
      continue;
    }
    if (files.length >= maxFiles) {
      notes.push(`Only ${maxFiles} files are allowed. Extra files were ignored.`);
      break;
    }
    files.push(item);
  }
  files.sort((a, b) => a.name.localeCompare(b.name));
  return { files, notes };
}
