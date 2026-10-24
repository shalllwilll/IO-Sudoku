// Minimal CSV writer for client-generated downloads (report, TQ list, declaration, run log).
// The backend has no endpoint for these as separate files (docs/contract-gaps.md), so they are
// built here from data the Result page already holds — never anything read from a file again.

const needsQuoting = /[",\n\r]/;

function cell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return needsQuoting.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** `rows` is an array of arrays; the first row is the header. CRLF line endings, as Excel expects. */
export function toCsv(rows) {
  return rows.map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
