import { useEffect, useState } from "react";
import { api } from "./api.js";
import { Table } from "./Table.jsx";

export function Uploads({ project, guard }) {
  const [files, setFiles] = useState([]);
  const load = () => guard(async () => setFiles(await api.get(`/api/projects/${project.id}/uploads`)));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line
  const onFile = (e) => {
    const f = e.target.files[0];
    if (f) guard(async () => { await api.upload(`/api/projects/${project.id}/uploads`, f); await load(); });
    e.target.value = "";
  };
  return (
    <div>
      <h3>Upload MDB workbooks (.xlsx)</h3>
      <input type="file" onChange={onFile} />
      <Table rows={files.map((f) => ({ name: f.name, size: f.size, sheets: f.sheets.map((s) => `${s.sheet}: ${s.rows} rows`).join("; ") }))}
             empty="No files uploaded." />
    </div>
  );
}

export function Mapping({ project, guard }) {
  const [m, setM] = useState(null);
  const [pick, setPick] = useState({});
  const load = () => guard(async () => setM(await api.get(`/api/projects/${project.id}/mapping`)));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line
  if (!m) return <p>Loading...</p>;
  const confirm = (file, field, column) =>
    guard(async () => {
      const confirmed = { ...m.confirmed, [file]: { ...(m.confirmed[file] || {}), [field]: column } };
      setM(await api.put(`/api/projects/${project.id}/mapping`, { confirmed }));
    });
  return (
    <div>
      <h3>Column mapping</h3>
      {m.sheets.length === 0 && <p><i>No uploaded sheets to map.</i></p>}
      {m.sheets.map((s) => (
        <div key={s.file + s.sheet}>
          <h4>{s.file} / {s.sheet}</h4>
          <Table rows={Object.values(s.matches).map((x) => ({ field: x.field, column: x.column, confidence: x.confidence, method: x.method }))} />
          {s.issues.map((i, k) => <p key={k}>[{i.severity}] {i.message}</p>)}
          <select onChange={(e) => setPick({ ...pick, [s.file]: { ...pick[s.file], field: e.target.value } })}>
            <option value="">field...</option>{m.fields.map((f) => <option key={f}>{f}</option>)}
          </select>
          <select onChange={(e) => setPick({ ...pick, [s.file]: { ...pick[s.file], column: e.target.value } })}>
            <option value="">column...</option>{s.columns.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button disabled={!(pick[s.file]?.field && pick[s.file]?.column)}
                  onClick={() => confirm(s.file, pick[s.file].field, pick[s.file].column)}>Confirm</button>
        </div>
      ))}
    </div>
  );
}

export function Values({ project, guard }) {
  const [v, setV] = useState(null);
  const [sel, setSel] = useState({});
  const load = () => guard(async () => setV(await api.get(`/api/projects/${project.id}/values`)));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line
  if (!v) return <p>Loading...</p>;
  const save = (u) => {
    const key = { io_type: "io_types", duty: "duty_classes", duty_class: "duty_classes", segregation: "segregation" }[u.field];
    const body = { ...v.overrides, [key]: { ...v.overrides[key], [u.value]: sel[u.field + u.value] } };
    guard(async () => setV(await api.put(`/api/projects/${project.id}/values`, body)));
  };
  return (
    <div>
      <h3>Unknown values</h3>
      {v.unknown.length === 0 && <p><i>No unknown values.</i></p>}
      {v.unknown.map((u) => {
        const opts = v.allowed[u.field === "duty" ? "duty_class" : u.field] || [];
        return (
          <p key={u.field + u.value}>
            {u.field} "{u.value}" x{u.count} (suggest: {u.suggestion || "-"}){" "}
            <select onChange={(e) => setSel({ ...sel, [u.field + u.value]: e.target.value })}>
              <option value="">map to...</option>{opts.map((o) => <option key={o}>{o}</option>)}
            </select>
            <button disabled={!sel[u.field + u.value]} onClick={() => save(u)}>Confirm</button>
          </p>
        );
      })}
      <h4>Current overrides</h4>
      <pre>{JSON.stringify(v.overrides, null, 1)}</pre>
    </div>
  );
}

export function Rules({ project, guard }) {
  const [r, setR] = useState(null);
  const [lint, setLint] = useState(null);
  const load = () => guard(async () => setR(await api.get(`/api/projects/${project.id}/rules`)));
  useEffect(() => { load(); }, [project.id]); // eslint-disable-line
  if (!r) return <p>Loading...</p>;
  const save = (body) => guard(async () => setR(await api.put(`/api/projects/${project.id}/rules`, body)));
  const toggle = (id) => save({ rules: r.rules.map((x) => (x.id === id ? { ...x, enabled: !x.enabled } : x)) });
  return (
    <div>
      <h3>Rules ({r.custom ? "custom" : `preset ${r.preset}`})</h3>
      <select value={r.custom ? "" : r.preset} onChange={(e) => save({ preset: e.target.value })}>
        <option value="">custom</option>{r.presets.map((p) => <option key={p}>{p}</option>)}
      </select>{" "}
      <button onClick={() => guard(async () => setLint(await api.post(`/api/projects/${project.id}/lint`, {})))}>Lint</button>
      <table border="1" cellPadding="3" style={{ borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr><th>on</th><th>id</th><th>primitive</th><th>scope</th><th>strength</th></tr></thead>
        <tbody>{r.rules.map((x) => (
          <tr key={x.id}>
            <td><input type="checkbox" checked={x.enabled} onChange={() => toggle(x.id)} /></td>
            <td>{x.id}</td><td>{x.primitive || x.builtin}</td><td>{x.scope}</td><td>{x.strength}</td>
          </tr>))}</tbody>
      </table>
      {lint && (<><h4>Lint</h4><Table rows={lint.findings} empty="No findings." />
        {lint.dry_run && <Table rows={lint.dry_run} />}</>)}
    </div>
  );
}
