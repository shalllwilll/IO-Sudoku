// Hand-written, deterministic sample result: 3 cabinets, 12 CIOCs, 96 baseplates, 1,152 positions,
// 189 invented signals. Nothing is copied from the dataset. Shapes follow the backend contract
// (provisional, MI-1); the placement `kind` values are assumed: signal, wired_spare.
const CABINETS = 3;
const CIOCS_PER_CABINET = 4;
const BASEPLATES = 8;
const CHANNELS = 12;
const SIGNALS = 189;
const IO_CYCLE = ["AIR", "DIR", "AOR", "DOR"];

export function buildResult() {
  const cabinets = [];
  const ciocs = [];
  for (let c = 1; c <= CABINETS; c++) {
    const list = [];
    for (let k = 1; k <= CIOCS_PER_CABINET; k++) {
      const no = (c - 1) * CIOCS_PER_CABINET + k;
      list.push(no);
      ciocs.push({
        no,
        name: `CIOC-${String(no).padStart(2, "0")}`,
        cabinet: c,
        controller: c,
        seq_in_cabinet: k,
        baseplates: Array.from({ length: BASEPLATES }, (_, i) => ({
          n: i + 1,
          name: `BP-${i + 1}`,
          cioc_no: no,
          reserved: no === 1 && i + 1 === BASEPLATES ? "alarm" : null,
        })),
      });
    }
    cabinets.push({ no: c, name: `CAB-${String(c).padStart(2, "0")}`, ciocs: list });
  }

  // Fill baseplates 1 and 2 of each CIOC in order: signals, with every 12th position a wired spare.
  const placements = [];
  let placedSignals = 0;
  let position = 0;
  outer: for (const cioc of ciocs) {
    for (let bp = 1; bp <= 2; bp++) {
      for (let ch = 1; ch <= CHANNELS; ch++) {
        if (placedSignals >= SIGNALS) break outer;
        position++;
        if (position % 12 === 0) {
          placements.push({ cioc_no: cioc.no, baseplate: bp, channel: ch, kind: "wired_spare", io_type: "AIR", pair: (position % 6) + 1, group: null, signal: null, cable: `CBL-${Math.ceil(position / 6)}` });
          continue;
        }
        placedSignals++;
        const n = placedSignals;
        const io = IO_CYCLE[n % 4];
        placements.push({
          cioc_no: cioc.no,
          baseplate: bp,
          channel: ch,
          kind: "signal",
          io_type: io,
          duty_class: io === "DOR" ? "SOV" : null,
          group: n % 5 === 0 ? "CONTROL" : null,
          pair: (n % 6) + 1,
          signal: {
            tag: `MOCK-${io}-${String(n).padStart(4, "0")}`,
            instrument_description: `Sample signal ${n}`,
            io_type: io,
            signal_type: io.startsWith("A") ? "4-20mA" : "24VDC",
            cable: `CBL-${Math.ceil(n / 6)}`,
            pair: (n % 6) + 1,
            source_file: "sample.xlsx",
            source_row: n + 4,
            area: "Area 1",
            status: "Field",
          },
        });
      }
    }
  }

  const tag = (n) => `MOCK-${IO_CYCLE[n % 4]}-${String(n).padStart(4, "0")}`;
  const tqs = [
    { id: "tq-1", code: "MISSING_CABLE", category: "missing data", severity: "warning", status: "open", message: "Cable is missing for this signal.", subject: tag(7), default_applied: "Placed with a spare cable.", signal_keys: [tag(7)], source_row: 11, options: [{ label: "Use cable CBL-2", consequence: "Signal joins cable CBL-2." }, { label: "Keep default", consequence: "No change." }], answer: null },
    { id: "tq-2", code: "SEGREGATION_CONFLICT", category: "rule conflicts", severity: "error", status: "open", message: "Two segregation groups meet in one CIOC.", subject: tag(30), default_applied: "Moved to the next CIOC.", signal_keys: [tag(30), tag(31)], source_row: 34, options: [{ label: "Allow", consequence: "Rule relaxed for this pair." }], answer: null },
    { id: "tq-3", code: "BASEPLATE_FULL", category: "capacity issues", severity: "info", status: "answered", message: "Baseplate is full.", subject: tag(60), default_applied: "Next baseplate used.", signal_keys: [tag(60)], source_row: 64, options: [{ label: "Accept", consequence: "No change." }], answer: "Accept" },
    { id: "tq-4", code: "UNKNOWN_IO_TYPE", category: "missing data", severity: "error", status: "open", message: "IO type could not be read.", subject: "Row 120", default_applied: "Held out.", signal_keys: [], source_row: 124, options: [{ label: "Set to DIR", consequence: "Signal is placed as DIR." }], answer: null },
  ];

  const used = new Set(placements.map((p) => `${p.cioc_no}:${p.baseplate}`));
  const kpi = {
    cabinets: new Set(placements.map((p) => Math.ceil(p.cioc_no / CIOCS_PER_CABINET))).size,
    ciocs: new Set(placements.map((p) => p.cioc_no)).size,
    signals_total: SIGNALS + 1,
    allocated: placedSignals,
    held_out: 1,
    utilisation: Math.round((placements.length / (used.size * CHANNELS)) * 1000) / 1000,
    positions: CABINETS * CIOCS_PER_CABINET * BASEPLATES * CHANNELS,
    occupied: placements.length,
    baseplates: CABINETS * CIOCS_PER_CABINET * BASEPLATES,
    baseplates_used: used.size,
    empty_baseplates: CABINETS * CIOCS_PER_CABINET * BASEPLATES - used.size,
    wired_spare_pairs: placements.filter((p) => p.kind === "wired_spare").length,
    free_slots_on_used_baseplates: used.size * CHANNELS - placements.length,
    spares: {
      cabinets: cabinets.map((cab) => {
        const inCab = placements.filter((p) => cab.ciocs.includes(p.cioc_no));
        const usedBp = new Set(inCab.map((p) => `${p.cioc_no}:${p.baseplate}`)).size;
        return {
          cabinet: cab.name,
          ciocs_used: new Set(inCab.map((p) => p.cioc_no)).size,
          baseplates_used: usedBp,
          fill: inCab.length,
          wired_spare_pairs: inCab.filter((p) => p.kind === "wired_spare").length,
          free_slots: usedBp * CHANNELS - inCab.length,
          empty_baseplates: CIOCS_PER_CABINET * BASEPLATES - usedBp,
          target: 10,
          actual: usedBp ? Math.round(((usedBp * CHANNELS - inCab.length) / (usedBp * CHANNELS)) * 100) : 0,
        };
      }),
      by_controller_io: [{ controller: "1", io_type: "AIR", target: 10, actual: 12 }],
    },
  };

  return {
    layout: { run_id: "", layout: { cabinets, ciocs, controllers: [], issues: [] } },
    allocation: { run_id: "", solver: "mock-greedy", placements, unplaced: [{ signal: { tag: "Row 120" }, issues: [] }], issues: [], utilisation: {} },
    report: {
      run_id: "",
      report: {
        kpi,
        declaration: { rule_set: "default", rules: ["Segregation separation", "Spare capacity"], assumed: ["Spare percentage 10"], defaulted: ["Naming preset sample"], not_enforced: ["Keep cable pairs together"] },
        rules: [
          { id: "sep-seg", name: "Segregation separation", status: "pass", touched: 120, violations: 0 },
          { id: "spare-pct", name: "Spare capacity", status: "pass", touched: 3, violations: 0 },
          { id: "co-cable", name: "Keep cable pairs together", status: "not_enforced", touched: 0, violations: 0, not_enforced_reason: "Needs cable data that is not mapped." },
        ],
        solver: "mock-greedy",
        pack_hash: "mock0000",
      },
    },
    tqs,
  };
}
