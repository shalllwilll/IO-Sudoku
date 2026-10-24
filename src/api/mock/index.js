// Mock adapter. Hand-written sample data in the backend's response shapes (provisional, MI-1).
// Nothing here is copied from the dataset. Functions resolve after a short delay so
// loading states are exercised.
import { DEFAULT_PREFERENCES } from "../../features/preferences/schema.js";
import { NetworkError, ServerError } from "../errors.js";
import { ProjectListSchema, ProjectSchema, parseResponse } from "../schemas.js";

export const mockControls = { delayMs: 120, failNext: null, corruptNext: false, chatReply: null };

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

const store = { projects: [], uploads: {}, seq: 1 };

export function resetMock() {
  store.projects = [];
  store.uploads = {};
  store.seq = 1;
  mockControls.delayMs = 120;
  mockControls.failNext = null;
  mockControls.corruptNext = false;
  mockControls.chatReply = null;
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
};
