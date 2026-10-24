import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Table } from "./Table.jsx";

function useRunData(project, run, guard, suffix) {
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    if (run?.status === "finished")
      guard(async () => setData(await api.get(`/api/projects/${project.id}/runs/${run.id}/${suffix}`)));
  }, [project.id, run?.id, run?.status, suffix]); // eslint-disable-line
  return data;
}

const NEED_RUN = <p><i>No finished run yet. Use the Run tab.</i></p>;

export function Allocation({ project, run, guard }) {
  const a = useRunData(project, run, guard, "allocation");
  const [f, setF] = useState({ text: "", status: "" });
  if (!run || run.status !== "finished") return NEED_RUN;
  if (!a) return <p>Loading...</p>;
  const rows = a.rows.filter((r) =>
    (!f.status || r.tagstatus === f.status) &&
    (!f.text || JSON.stringify(r).toLowerCase().includes(f.text.toLowerCase())));
  const statuses = [...new Set(a.rows.map((r) => r.tagstatus))];
  const k = run.summary;
  return (
    <div>
      <h3>KPI</h3>
      <Table rows={[{ allocated: k.allocated, held_out: k.held_out, cabinets: k.cabinets, ciocs: k.ciocs,
        spare_slots: k.spare_slots, wired_spare_pairs: k.wired_spare_pairs, utilisation: k.utilisation, solver: k.solver }]} />
      <h3>Allocation ({rows.length} of {a.rows.length} rows)</h3>
      <input placeholder="filter text" value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />{" "}
      <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
        <option value="">all statuses</option>{statuses.map((s) => <option key={s}>{s}</option>)}
      </select>
      <Table rows={rows.slice(0, 500)} cols={["srno","tagname","cioccslsname","baseplate","channelno","charmno","tagstatus","iotype","fieldcableno"]} />
      {rows.length > 500 && <p>Showing the first 500 rows.</p>}
    </div>
  );
}

export function Report({ project, run, guard }) {
  const r = useRunData(project, run, guard, "report");
  if (!run || run.status !== "finished") return NEED_RUN;
  if (!r) return <p>Loading...</p>;
  const rep = r.report;
  return (
    <div>
      <h3>KPI and spares</h3>
      <pre>{JSON.stringify({ ...rep.kpi, spares: undefined }, null, 1)}</pre>
      <h3>Rule check</h3>
      <Table rows={rep.rules.map((x) => ({ rule: x.rule, description: x.description, passed: x.passed, violations: x.violations, enforced: x.enforced }))} />
      <h3>Declaration</h3>
      <pre>{JSON.stringify(rep.declaration, null, 1)}</pre>
    </div>
  );
}

export function Tqs({ project, run, guard }) {
  const [tqs, setTqs] = useState(null);
  const [form, setForm] = useState({});
  const load = () => guard(async () => setTqs(await api.get(`/api/projects/${project.id}/tqs`)));
  useEffect(() => { load(); }, [project.id, run?.id]); // eslint-disable-line
  if (!tqs) return <p>Loading...</p>;
  const set = (id, k, v) => setForm({ ...form, [id]: { ...form[id], [k]: v } });
  const answer = (t) => {
    const f = form[t.id] || {};
    guard(async () => {
      await api.post(`/api/projects/${project.id}/tqs/${t.id}/answer`,
        { option: f.option || t.options[0].label, value: f.value || null, scope: f.scope || "everywhere" });
      await load();
    });
  };
  return (
    <div>
      <h3>Technical queries ({tqs.length})</h3>
      <p>Answer, then run again from the Run tab to see the effect.</p>
      {tqs.length === 0 && <p><i>No TQs.</i></p>}
      {tqs.map((t) => (
        <div key={t.id} style={{ borderBottom: "1px solid #ccc", padding: 4 }}>
          <b>{t.code}</b> [{t.severity}] {t.message} <i>({t.status}{t.answer ? `: ${t.answer}` : ""})</i>
          <div>
            <select onChange={(e) => set(t.id, "option", e.target.value)}>
              {t.options.map((o) => <option key={o.label}>{o.label}</option>)}
            </select>
            <input placeholder="value" onChange={(e) => set(t.id, "value", e.target.value)} />
            <select onChange={(e) => set(t.id, "scope", e.target.value)}>
              <option>everywhere</option><option>cable</option><option>row</option>
            </select>
            <button onClick={() => answer(t)}>Answer</button>
          </div>
        </div>
      ))}
    </div>
  );
}
