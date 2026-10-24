import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api/index.js";
import Badge from "../components/ui/Badge.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import Input from "../components/ui/Input.jsx";
import Select from "../components/ui/Select.jsx";
import RunTable, { Pager } from "../features/history/RunTable.jsx";

const PAGE_SIZE = 25;
const STATUSES = ["all", "running", "finished", "failed"];

/**
 * Every run the user has started, across every project. The backend scopes a project to its
 * owner, so this client makes no extra filter of its own — it shows whatever listProjects returns
 * (MI-3). Filters and the page live in the URL, so a refresh keeps the same view (T-7.3-7); nothing
 * here is cached in localStorage (MI-14).
 */
export default function History() {
  const [params, setParams] = useSearchParams();
  const [state, setState] = useState(null);
  const [error, setError] = useState("");

  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "all";
  const page = Number(params.get("page") ?? "0") || 0;

  const load = useCallback(() => {
    api
      .listProjects()
      .then(async (projects) => {
        const detailed = await Promise.all(
          projects.map(async (project) => {
            const [runs, chain] = await Promise.all([api.listRuns(project.id), api.getRevisions(project.id).catch(() => [])]);
            return { project, runs, revisionCount: Math.max(0, chain.length - 1) };
          }),
        );
        setError("");
        setState({ projects: detailed });
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  function setParam(key, value) {
    const next = new URLSearchParams(params);
    if (value === "" || value === "all" || value === 0) next.delete(key);
    else next.set(key, String(value));
    if (key !== "page") next.delete("page");
    setParams(next, { replace: true });
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!state) return <p role="status">Loading history</p>;

  if (state.projects.length === 0) {
    return (
      <EmptyState title="No projects yet">
        <Link className="underline" to="/projects">
          Start a project
        </Link>
      </EmptyState>
    );
  }

  const allRuns = state.projects.flatMap(({ project, runs }) =>
    runs.map((run) => ({ run, projectId: project.id, projectName: project.name })),
  );
  const qLower = q.trim().toLowerCase();
  const filtered = allRuns
    .filter((r) => status === "all" || r.run.status === status)
    .filter((r) => !qLower || r.projectName.toLowerCase().includes(qLower) || r.run.id.toLowerCase().includes(qLower))
    .sort((a, b) => new Date(b.run.created_at) - new Date(a.run.created_at));

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const slice = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">History</h1>

      <section>
        <h2 className="mb-2 text-sm font-semibold">Projects</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-soft-white/60">
            <tr>
              <th className="py-1">Name</th>
              <th>Last run</th>
              <th>Status</th>
              <th>Revisions</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {state.projects.map(({ project, runs, revisionCount }) => {
              const last = [...runs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
              return (
                <tr key={project.id} className="border-t border-steel/50">
                  <td className="py-2">{project.name}</td>
                  <td>{last ? new Date(last.created_at).toLocaleString() : "No runs yet"}</td>
                  <td>{last ? <Badge>{last.status}</Badge> : "—"}</td>
                  <td>{revisionCount}</td>
                  <td className="text-right">
                    <Link className="text-xs underline" to={`/projects/${project.id}/revisions`}>
                      Revisions
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Every run</h2>
        <div className="flex flex-wrap gap-2">
          <Input label="Search" className="w-56" value={q} onChange={(e) => setParam("q", e.target.value)} placeholder="Project or run id" />
          <Select label="Status" className="w-40" value={status} onChange={(e) => setParam("status", e.target.value)} options={STATUSES} />
        </div>
        <RunTable rows={slice} />
        <Pager page={current} pages={pages} onChange={(p) => setParam("page", p)} />
      </section>
    </div>
  );
}
