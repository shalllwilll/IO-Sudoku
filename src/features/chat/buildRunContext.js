// Summary context for the result chat. Counts, rule names and TQ codes and categories only.
// TQ free text and tags are never included; redact() enforces the allow-list again.
export function buildRunContext(report, tqs) {
  const kpi = report.report.kpi;
  return {
    cabinets: kpi.cabinets,
    ciocs: kpi.ciocs,
    signalsTotal: kpi.signals_total,
    allocated: kpi.allocated,
    tqCount: tqs.length,
    tqCodes: [...new Set(tqs.map((t) => t.code))],
    tqCategories: [...new Set(tqs.map((t) => t.category))],
    ruleNames: report.report.rules.map((r) => r.name),
  };
}
