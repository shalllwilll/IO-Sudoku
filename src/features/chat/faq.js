// Canned answers used when the model fails, is unavailable, or the browser is offline.
export const FAQ = [
  { words: ["mapping", "map", "column"], answer: "Mapping matches each column of your file to a signal field. Check low-confidence rows, fix any wrong match, and make sure the required fields are mapped once." },
  { words: ["rule", "rules"], answer: "Rules control how signals are grouped and separated. Switch rules on or off, set the separation level, then use Lint and Dry-run to test them before the run." },
  { words: ["tq", "query", "queries"], answer: "A TQ (technical query) is raised when the engine cannot decide safely. Every signal is either placed or listed as a TQ. Answer it to resolve it." },
  { words: ["spare", "spares"], answer: "Spares are of three kinds: wired spare pairs, free slots on used baseplates, and empty baseplates. The Report tab shows each separately." },
  { words: ["upload", "file"], answer: "Upload one or more Excel files (.xlsx, .xlsm, .xls) or CSV. Files are read in name order." },
  { words: ["run", "allocate"], answer: "Press Run on the Run page. Progress streams live, then the result page shows the cabinets, CIOCs and baseplates." },
];

export const FALLBACK_ANSWER = "The assistant is unavailable right now. Try asking about mapping, rules, TQs, spares, uploads or running.";

export function faqAnswer(text) {
  const lower = text.toLowerCase();
  const hit = FAQ.find((entry) => entry.words.some((word) => lower.includes(word)));
  return hit ? hit.answer : FALLBACK_ANSWER;
}
