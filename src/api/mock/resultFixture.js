// Hand-written, deterministic sample result: 3 cabinets, 12 CIOCs, 96 baseplates, 1,152 positions,
// 189 invented signals. Nothing is copied from the dataset. Shapes follow the backend contract
// (backend/docs/openapi.json). Placement kinds are field, wired_spare and cabinet_alarm. A field
// placement carries its IO type on the signal; only a wired spare has io_type on the placement.
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
          placements.push({ cioc_no: cioc.no, baseplate: bp, channel: ch, kind: "wired_spare", io_type: "AIR", pair: (position % 6) + 1, group: null, signal: null });
          continue;
        }
        placedSignals++;
        const n = placedSignals;
        const io = IO_CYCLE[n % 4];
        placements.push({
          cioc_no: cioc.no,
          baseplate: bp,
          channel: ch,
          kind: "field",
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

  const key = (n) => `sample.xlsx:${n + 4}`;
  const tqs = [
    { id: "TQ-0001", code: "TQ-DATA", category: "missing data", severity: "assumed", status: "open", message: "Cable is missing for this signal.", subject: key(7), default_applied: "Placed with a spare cable.", scope: "signal", signal_keys: [key(7)], source_file: "sample.xlsx", source_row: 11, data: { cable: "CBL-2" }, options: [{ label: "Correct the source data", consequence: "Signal is allocated on the next run." }, { label: "Leave as is", consequence: "The default stays." }], answer: null },
    { id: "TQ-0002", code: "TQ-SEG", category: "rule conflicts", severity: "blocking", status: "open", message: "Two segregation groups meet in one CIOC.", subject: key(30), default_applied: "Moved to the next CIOC.", scope: "signal", signal_keys: [key(30), key(31)], source_file: "sample.xlsx", source_row: 34, data: {}, options: [{ label: "Confirm the segregation", consequence: "Signals are separated into compatible CIOCs." }, { label: "Correct the cable data", consequence: "Cable no longer mixes families." }], answer: null },
    { id: "TQ-0003", code: "TQ-CAP", category: "capacity issues", severity: "info", status: "answered", message: "Baseplate is full.", subject: key(60), default_applied: "Next baseplate used.", scope: "signal", signal_keys: [key(60)], source_file: "sample.xlsx", source_row: 64, data: {}, options: [{ label: "Allow more cabinets", consequence: "Signals are placed in added capacity." }, { label: "Split the cable", consequence: "Smaller blocks may fit." }], answer: "Allow more cabinets" },
    { id: "TQ-0004", code: "TQ-VALUE", category: "missing data", severity: "blocking", status: "open", message: "IO type could not be read.", subject: "IO type could not be read.", default_applied: "Held out.", scope: "signal", signal_keys: [], source_file: null, source_row: null, data: {}, options: [{ label: "Map to a known value", consequence: "Signal follows that value's rules." }, { label: "Keep the default policy", consequence: "Unknown value keeps its safe default." }], answer: null },
  ];

  const used = new Set(placements.map((p) => `${p.cioc_no}:${p.baseplate}`));
  const kpi = {
    cabinets: new Set(placements.map((p) => Math.ceil(p.cioc_no / CIOCS_PER_CABINET))).size,
    ciocs: new Set(placements.map((p) => p.cioc_no)).size,
    signals_total: SIGNALS + 1,
    allocated: placedSignals,
    by_io_type: {},
    controllers: CABINETS,
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
          wired_spare_pairs: inCab.filter((p) => p.kind === "wired_spare").length,
          free_slots_on_used_baseplates: usedBp * CHANNELS - inCab.length,
          empty_baseplates: CIOCS_PER_CABINET * BASEPLATES - usedBp,
          required_empty_baseplates: 2,
        };
      }),
      by_controller_io: [{ controller: "1", io_type: "AIR", field_signals: 47, required: 4, wired_spares: 6 }],
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
          { rule: "R-ONCE", description: "Every signal is allocated exactly once or is in the TQ list", passed: true, violations: 0, enforced: true, strength: "hard" },
          { rule: "R-CAP", description: "Capacity: 12 channels, 8 baseplates, 4 CIOCs, one signal per position", passed: true, violations: 0, enforced: true, strength: "hard" },
          { rule: "sep-seg", description: "Segregation separation", passed: true, violations: 0, enforced: true, strength: "hard" },
          { rule: "spare-pct", description: "Spare capacity", passed: true, violations: 0, enforced: true, strength: "soft" },
          { rule: "co-cable", description: "Keep cable pairs together: Needs cable data that is not mapped.", passed: false, violations: 0, enforced: false, strength: "hard" },
        ],
        solver: "mock-greedy",
        pack_hash: "mock0000",
      },
    },
    tqs,
  };
}
