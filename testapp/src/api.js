export const BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export class ApiFailure extends Error {}

async function call(path, opts = {}) {
  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch {
    throw new ApiFailure(`Cannot reach the backend at ${BASE}. Is it running?`);
  }
  if (!res.ok) {
    let body = null;
    try {
      body = await res.json();
    } catch {
      /* not json */
    }
    throw new ApiFailure(body ? `${body.code}: ${body.message}` : `HTTP ${res.status}`);
  }
  return res;
}

const json = (method, body) => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body ?? {}),
});

export const api = {
  get: async (p) => (await call(p)).json(),
  post: async (p, b) => (await call(p, json("POST", b))).json(),
  put: async (p, b) => (await call(p, json("PUT", b))).json(),
  upload: async (p, file) => {
    const f = new FormData();
    f.append("file", file);
    return (await call(p, { method: "POST", body: f })).json();
  },
};

export const downloadUrl = (pid, rid) => `${BASE}/api/projects/${pid}/runs/${rid}/download`;
