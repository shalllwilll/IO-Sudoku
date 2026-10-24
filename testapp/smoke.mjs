// Checks every screen's API calls against a running backend. Usage: API_BASE=http://localhost:8000 npm run smoke [file.xlsx]
import { readFileSync } from "node:fs";

const BASE = process.env.API_BASE || process.env.VITE_API_BASE || "http://localhost:8000";
const file = process.argv[2];
let failed = 0;

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok    ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL  ${name}: ${e.message}`);
  }
}
async function req(method, path, body) {
  const r = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${await r.text()}`);
  return r;
}

let pid, rid;
await step("health", async () => { await req("GET", "/api/health"); });
await step("create project", async () => { pid = (await (await req("POST", "/api/projects", { name: "smoke", area: "P30", unit: "32001" })).json()).id; });
const p = () => `/api/projects/${pid}`;
for (const tab of ["uploads", "mapping", "values", "rules", "runs", "tqs"])
  await step(`empty screen: ${tab}`, async () => { await req("GET", `${p()}/${tab}`); });
if (file) {
  await step("upload", async () => {
    const f = new FormData();
    f.append("file", new Blob([readFileSync(file)]), "sample.xlsx");
    const r = await fetch(BASE + `${p()}/uploads`, { method: "POST", body: f });
    if (!r.ok) throw new Error(await r.text());
  });
  await step("lint", async () => { await req("POST", `${p()}/lint`, {}); });
  await step("run + events", async () => {
    rid = (await (await req("POST", `${p()}/runs`, {})).json()).id;
    const text = await (await req("GET", `${p()}/runs/${rid}/events`)).text();
    if (!text.includes("event: run.started") || !text.includes("event: run.finished")) throw new Error("incomplete stream");
  });
  for (const tab of ["", "/allocation", "/layout", "/groups", "/report", "/impact", "/tqs", "/download"])
    await step(`run screen: ${tab || "status"}`, async () => { await req("GET", `${p()}/runs/${rid}${tab}`); });
}
console.log(failed ? `${failed} failed` : "all screens ok");
process.exit(failed ? 1 : 0);
