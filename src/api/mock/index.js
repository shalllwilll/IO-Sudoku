// Mock adapter. Hand-written sample data in the backend's response shapes (see api/live/wire.js).
// Nothing here is copied from the dataset. Functions resolve after a short delay so
// loading states are exercised.
import { DEFAULT_PREFERENCES } from "../../features/preferences/schema.js";
import { NetworkError, ServerError } from "../errors.js";
import { buildResult } from "./resultFixture.js";
import {
  AllocationSchema,
  AnswerSchema,
  LayoutSchema,
  ReportSchema,
  TqListSchema,
  LintSchema,
  MappingSchema,
  ProjectListSchema,
  ProjectSchema,
  RulePreviewSchema,
  RulesSchema,
  RunListSchema,
  RunSchema,
  ValuesSchema,
  parseResponse,
} from "../schemas.js";

import { openMockStream, resetStreamOptions } from "./stream.js";

export const mockControls = { delayMs: 120, failNext: null, corruptNext: false, chatReply: null, hang: false };

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gate() {
  await wait(mockControls.delayMs);
  const fail = mockControls.failNext;
  if (fail) {
    mockControls.failNext = null;
    if (fail === "network") throw new NetworkError();
    if (fail === "rate") throw new ServerError("Too many attempts.", { status: 429 });
    throw new ServerError("Mock server failure.");
  }
}

const store = { projects: [], uploads: {}, mapping: {}, values: {}, rules: {}, runs: {}, results: {}, seq: 1 };

export function resetMock() {
  store.projects = [];
  store.uploads = {};
  store.mapping = {};
  store.values = {};
  store.rules = {};
  store.runs = {};
  store.results = {};
  resetStreamOptions();
  mockControls.hang = false;
  store.seq = 1;
  mockControls.delayMs = 120;
  mockControls.failNext = null;
  mockControls.corruptNext = false;
  mockControls.chatReply = null;
}

function resultFor(rid) {
  return (store.results[rid] ||= buildResult());
}

function findProject(pid) {
  const found = store.projects.find((project) => project.id === pid);
  if (!found) throw new ServerError("Project not found.", { status: 404, code: "not_found" });
  return found;
}

export const mockApi = {
  async signIn({ email, password }) {
    await gate();
    if (!password) throw new ServerError("Wrong email or password.", { status: 401 });
    return { email };
  },

  async getDefaults() {
    await gate();
    return { ...DEFAULT_PREFERENCES };
  },

  async chat({ message }) {
    await gate();
    if (mockControls.chatReply !== null) return mockControls.chatReply;
    return { text: `(mock) You asked: ${message.slice(0, 80)}` };
  },

  async listProjects() {
    await gate();
    return parseResponse(ProjectListSchema, store.projects, "listProjects");
  },

  async createProject({ name }) {
    await gate();
    const project = {
      id: `p${store.seq++}`,
      name,
      created_at: new Date().toISOString(),
      runs: 0,
      uploads: 0,
    };
    store.projects.push(project);
    const out = mockControls.corruptNext ? { ...project, id: 42 } : project;
    mockControls.corruptNext = false;
    return parseResponse(ProjectSchema, out, "createProject");
  },

  async getProject(pid) {
    await gate();
    return parseResponse(ProjectSchema, findProject(pid), "getProject");
  },

  async uploadFile(pid, file) {
    await gate();
    const project = findProject(pid);
    const upload = {
      id: `u${store.seq++}`,
      name: file.name,
      size: file.size,
      sha256: "mock",
      created_at: new Date().toISOString(),
      sheets: [{ sheet: "Sheet1", rows: 190, columns: ["Tag", "IO Type", "Cable", "Pair"] }],
    };
    (store.uploads[pid] ||= []).push(upload);
    project.uploads += 1;
    return upload;
  },

  async getMapping(pid) {
    await gate();
    findProject(pid);
    const files = store.uploads[pid]?.length ? store.uploads[pid] : [{ name: "sample.xlsx" }];
    const sheets = files.map((file, n) => ({
      file: file.name,
      sheet: "Sheet1",
      columns: SAMPLE_COLUMNS.map((c) => (n === 1 && c === "Cable No" ? "Cable Ref" : c)),
      matches: SAMPLE_MATCHES,
      issues: [],
      ai_hints: {},
      grouping_mode: "one_column",
    }));
    const mapping = {
      fields: ["tag", "io_type", "cable", "pair", "area", "service", "group", "segregation", "grouping"],
      required: ["tag", "io_type", "cable", "pair"],
      confirmed: store.mapping[pid] ?? {},
      sheets,
    };
    return parseResponse(MappingSchema, mapping, "getMapping");
  },

  /** `confirmed` is the wire shape: { fileName: { field: columnName } }. */
  async saveMapping(pid, confirmed) {
    await gate();
    store.mapping[pid] = confirmed;
    return mockApi.getMapping(pid);
  },

  async getValues(pid) {
    await gate();
    findProject(pid);
    const overrides = store.values[pid] ?? { io_types: {}, duty_classes: {}, segregation: {} };
    const values = {
      allowed: { io_type: ["AIR", "AOR", "DIR", "DOR"] },
      overrides,
      unknown: [{ field: "io_type", value: "XQ", count: 2 }],
      observed: {
        io_type: [
          { value: "AI", count: 60 },
          { value: "AO", count: 20 },
          { value: "DI", count: 70 },
          { value: "DO-SOV", count: 30 },
          { value: "XQ", count: 2 },
        ],
        grouping: ["-", "A", "B", "A-CONTROL", "B-ALARM", "C", "E"].map((value, i) => ({ value, count: 10 + i })),
      },
    };
    return parseResponse(ValuesSchema, values, "getValues");
  },

  async saveValues(pid, maps) {
    await gate();
    store.values[pid] = maps;
    return mockApi.getValues(pid);
  },

  async getRules(pid) {
    await gate();
    findProject(pid);
    if (!store.rules[pid]) store.rules[pid] = { preset: "default", presets: ["default", "strict", "relaxed"], custom: false, rules: defaultRules() };
    return parseResponse(RulesSchema, structuredClone(store.rules[pid]), "getRules");
  },

  async saveRules(pid, { preset, rules }) {
    await gate();
    const current = await mockApi.getRules(pid);
    const next = { ...current, preset: preset ?? current.preset, rules: rules ?? defaultRules(), custom: Boolean(rules) };
    store.rules[pid] = next;
    return parseResponse(RulesSchema, structuredClone(next), "saveRules");
  },

  async startRun(pid) {
    await gate();
    const project = findProject(pid);
    const run = { id: `r${store.seq++}`, project_id: pid, status: "running", created_at: new Date().toISOString(), finished_at: null, error: null, download_ready: false, summary: {} };
    (store.runs[pid] ||= []).push(run);
    project.runs += 1;
    return parseResponse(RunSchema, { ...run }, "startRun");
  },

  async getRun(pid, rid) {
    await gate();
    const run = store.runs[pid]?.find((r) => r.id === rid);
    if (!run) throw new ServerError("Run not found.", { status: 404, code: "not_found" });
    return parseResponse(RunSchema, { ...run }, "getRun");
  },

  async listRuns(pid) {
    await gate();
    findProject(pid);
    return parseResponse(RunListSchema, (store.runs[pid] ?? []).map((r) => ({ ...r })), "listRuns");
  },

  async getLayout(pid, rid) {
    await gate();
    return parseResponse(LayoutSchema, { ...resultFor(rid).layout, run_id: rid }, "getLayout");
  },

  async getAllocation(pid, rid) {
    await gate();
    return parseResponse(AllocationSchema, { ...resultFor(rid).allocation, run_id: rid }, "getAllocation");
  },

  async getReport(pid, rid) {
    await gate();
    return parseResponse(ReportSchema, { ...resultFor(rid).report, run_id: rid }, "getReport");
  },

  async getRunTqs(pid, rid) {
    await gate();
    return parseResponse(TqListSchema, resultFor(rid).tqs, "getRunTqs");
  },

  async answerTq(pid, tid, body) {
    await gate();
    for (const result of Object.values(store.results)) {
      const tq = result.tqs.find((t) => t.id === tid);
      if (tq) {
        if (!tq.options.some((o) => o.label === body.option)) {
          throw new ServerError(`"${body.option}" is not an option of ${tq.code}.`, { status: 422, code: "invalid_answer" });
        }
        tq.status = "answered";
        tq.answer = body.option;
        return parseResponse(AnswerSchema, { tq: { ...tq }, answer: body, history: [] }, "answerTq");
      }
    }
    throw new ServerError("TQ not found.", { status: 404, code: "not_found" });
  },

  openRunStream(pid, rid, handlers, options) {
    return openMockStream(handlers, options, (status, error) => {
      const run = store.runs[pid]?.find((r) => r.id === rid);
      if (run) Object.assign(run, { status, error: error ?? null, download_ready: status === "finished", finished_at: new Date().toISOString() });
    });
  },

  async lintRules(pid, rules) {
    await gate();
    const findings = [];
    const sep = rules.find((r) => r.primitive === "separate" && r.enabled);
    const co = rules.find((r) => r.primitive === "co_locate" && r.enabled);
    if (sep && co && sep.parameters.level === co.parameters.level) {
      findings.push({ rule_id: sep.id, severity: "error", message: "Conflicts with a keep-together rule at the same level." });
    }
    return parseResponse(LintSchema, { findings, dry_run: [{ would_place: 189, would_raise_tqs: findings.length, unplaced: 0 }] }, "lintRules");
  },

  async compileRule(pid, request) {
    await gate();
    const text = request.toLowerCase();
    if (mockControls.hang) return new Promise(() => {});
    let rule = null;
    let message = "Could not understand that rule. Rephrase it or use the form.";
    if (/\band\b.*\bnever\b|\bnever\b.*\balso\b/.test(text) || / and also /.test(text)) {
      message = "That sentence contains more than one rule. Please enter them one at a time.";
    } else if (/same cioc|apart|separate|never put/.test(text)) {
      rule = { ...newMockRule("separate"), name: "Keep A and B apart", parameters: { level: "CIOC" } };
      message = "Signals in segregation A and B must never share a CIOC.";
    }
    return parseResponse(RulePreviewSchema, { status: rule ? "ok" : "unclear", message, applied: false, rule, findings: [] }, "compileRule");
  },
};

function newMockRule(primitive) {
  return { id: `ai-${primitive}`, name: primitive, enabled: true, primitive, builtin: null, scope: "everywhere", strength: "hard", parameters: {}, not_enforced_reason: null };
}

function defaultRules() {
  return [
    { ...newMockRule("separate"), id: "sep-seg", name: "Segregation separation", parameters: { level: "CIOC" } },
    { ...newMockRule("reserve"), id: "spare-pct", name: "Spare capacity", parameters: { percent: 10 } },
    { ...newMockRule("capacity"), id: "cap-bp", name: "Baseplate capacity", parameters: { max: 12 } },
    { ...newMockRule("co_locate"), id: "co-cable", name: "Keep cable pairs together", parameters: { level: "baseplate" }, not_enforced_reason: "Needs cable data that is not mapped." },
  ];
}

const SAMPLE_COLUMNS = ["Instrument Tag", "IO Type", "Cable No", "Pair No", "Area", "Service", "Grp/Seg", "", "Remarks", "Vendor Note"];
const SAMPLE_MATCHES = {
  "Instrument Tag": { field: "tag", confidence: 0.98, method: "name" },
  "IO Type": { field: "io_type", confidence: 0.95, method: "name" },
  "Cable No": { field: "cable", confidence: 0.82, method: "fuzzy" },
  "Pair No": { field: "pair", confidence: 0.6, method: "fuzzy" },
  Area: { field: "area", confidence: 0.99, method: "name" },
  Service: { field: "service", confidence: 0.9, method: "name" },
  "Grp/Seg": { field: "grouping", confidence: 0.77, method: "fuzzy" },
};
