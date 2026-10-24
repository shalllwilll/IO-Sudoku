/**
 * Compares report totals with the grid counts. Returns a list of mismatches; empty means consistent.
 * The report numbers are displayed as given. This is only a safety net.
 */
export function crossCheck(report, model) {
  const kpi = report.report.kpi;
  const problems = [];
  const activeCabinets = model.perCabinet.filter((c) => c.occupied > 0).length;
  const activeCiocs = new Set(model.placements.map((p) => p.cioc_no)).size;
  if (kpi.allocated !== model.signalCount) problems.push(`Signals allocated: report ${kpi.allocated}, grid ${model.signalCount}.`);
  if (kpi.cabinets !== activeCabinets) problems.push(`Cabinets: report ${kpi.cabinets}, grid ${activeCabinets}.`);
  if (kpi.ciocs !== activeCiocs) problems.push(`CIOCs: report ${kpi.ciocs}, grid ${activeCiocs}.`);
  return problems;
}
