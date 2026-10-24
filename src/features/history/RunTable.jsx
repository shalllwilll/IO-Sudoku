import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import Badge from "../../components/ui/Badge.jsx";
import Button from "../../components/ui/Button.jsx";
import RunLog from "./RunLog.jsx";

const TONE = { finished: "high", running: "medium", failed: "low", cancelled: "neutral" };

/**
 * One row per run across the user's projects. `rows` are { run, projectName } pairs already
 * filtered, searched and sliced to one page by the caller, so this component stays dumb.
 * Every value is rendered as text — a project name or run id can contain markup characters
 * and must never be interpreted (T-7.3-10).
 */
export default function RunTable({ rows }) {
  const [open, setOpen] = useState(null);

  if (rows.length === 0) return <p className="text-sm text-soft-white/70">No runs match the filters.</p>;

  return (
    <table className="w-full text-left text-sm">
      <thead className="text-xs uppercase text-soft-white/60">
        <tr>
          <th className="py-1">Project</th>
          <th>Run</th>
          <th>Date</th>
          <th>Status</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map(({ run, projectName, projectId }) => (
          <Fragment key={run.id}>
            <tr className="border-t border-steel/50">
              <td className="py-2">{projectName}</td>
              <td className="font-mono text-xs">{run.id}</td>
              <td>{run.created_at ? new Date(run.created_at).toLocaleString() : "—"}</td>
              <td>
                <Badge tone={TONE[run.status] ?? "neutral"}>{run.status}</Badge>
              </td>
              <td className="space-x-2 text-right">
                <button type="button" className="focus-ring text-xs underline" onClick={() => setOpen(open === run.id ? null : run.id)}>
                  {open === run.id ? "Hide log" : "Log"}
                </button>
                {run.status === "finished" && (
                  <Link className="text-xs underline" to={`/projects/${projectId}/result?run=${run.id}`}>
                    Open
                  </Link>
                )}
              </td>
            </tr>
            {open === run.id && (
              <tr>
                <td colSpan={5} className="pb-3">
                  <RunLog run={run} />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export function Pager({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-3 text-xs">
      <Button variant="secondary" disabled={page === 0} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      Page {page + 1} of {pages}
      <Button variant="secondary" disabled={page >= pages - 1} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </div>
  );
}
