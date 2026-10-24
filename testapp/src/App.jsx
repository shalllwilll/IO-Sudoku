import { useCallback, useEffect, useRef, useState } from "react";
import { api, BASE } from "./api.js";
import { Allocation, Report, Tqs } from "./Results.jsx";
import { Mapping, Rules, Uploads, Values } from "./Setup.jsx";
import { RunPanel } from "./Run.jsx";

const TABS = ["Upload", "Mapping", "Values", "Rules", "Run", "Allocation", "Report", "TQs"];

export default function App() {
  const [tab, setTab] = useState("Upload");
  const [project, setProject] = useState(null);
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");
  const [log, setLog] = useState([]);
  const [busy, setBusy] = useState(false);
  const src = useRef(null);

  const guard = useCallback(async (fn) => {
    setError("");
    try {
      return await fn();
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    guard(async () => {
      const id = localStorage.getItem("pid");
      if (id) setProject(await api.get(`/api/projects/${id}`).catch(() => null));
    });
  }, [guard]);

  const create = () =>
    guard(async () => {
      const p = await api.post("/api/projects", { name: "Test project", area: "P30", unit: "32001" });
      localStorage.setItem("pid", p.id);
      setProject(p);
      setRun(null);
    });

  const EVENTS = ["run.started", "stage.started", "stage.finished", "group.formed", "placement",
    "rejection", "spare.assigned", "solver.status", "fallback.triggered", "tq.raised",
    "validation.result", "run.finished", "error"];

  // The stream lives here, not in the Run tab, so switching tabs does not lose it.
  const startRun = () =>
    guard(async () => {
      src.current?.close();
      setLog([]);
      setBusy(true);
      let r;
      try {
        r = await api.post(`/api/projects/${project.id}/runs`, {});
      } catch (e) {
        setBusy(false);
        throw e;
      }
      setRun(r);
      const es = new EventSource(`${BASE}/api/projects/${project.id}/runs/${r.id}/events`);
      src.current = es;
      const done = () => {
        es.close();
        setBusy(false);
        api.get(`/api/projects/${project.id}/runs/${r.id}`).then(setRun).catch((e) => setError(e.message));
      };
      const add = (e) => {
        const ev = JSON.parse(e.data);
        setLog((l) => [...l, `${ev.seq} ${ev.type} ${JSON.stringify(ev.data).slice(0, 110)}`]);
        if (ev.type === "run.finished" || ev.type === "error") done();
      };
      EVENTS.forEach((t) => es.addEventListener(t, add));
      es.onerror = () => { es.close(); setBusy(false); setError("Lost the event stream; refresh the run status."); };
    });

  const ctx = { project, run, setRun, guard, setTab, log, busy, startRun };
  return (
    <div style={{ fontFamily: "sans-serif", padding: 16 }}>
      <h2>IO Sudoku test app</h2>
      <p>
        API: {BASE} | Project: {project ? `${project.name} (${project.id})` : "none"}{" "}
        <button onClick={create}>New project</button>
      </p>
      {error && <p style={{ color: "crimson" }} role="alert">Error: {error}</p>}
      <nav>
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} disabled={tab === t}>{t}</button>
        ))}
      </nav>
      <hr />
      {!project ? (
        <p>No project yet. Click "New project".</p>
      ) : (
        <>
          {tab === "Upload" && <Uploads {...ctx} />}
          {tab === "Mapping" && <Mapping {...ctx} />}
          {tab === "Values" && <Values {...ctx} />}
          {tab === "Rules" && <Rules {...ctx} />}
          {tab === "Run" && <RunPanel {...ctx} />}
          {tab === "Allocation" && <Allocation {...ctx} />}
          {tab === "Report" && <Report {...ctx} />}
          {tab === "TQs" && <Tqs {...ctx} />}
        </>
      )}
    </div>
  );
}
