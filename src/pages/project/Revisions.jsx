import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api/index.js";
import Button from "../../components/ui/Button.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import Panel from "../../components/ui/Panel.jsx";
import CompareView from "../../features/revisions/CompareView.jsx";
import ReviseDialog from "../../features/revisions/ReviseDialog.jsx";
import RevisionChain from "../../features/revisions/RevisionChain.jsx";

export default function Revisions() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chain, setChain] = useState(null);
  const [runs, setRuns] = useState(null);
  const [error, setError] = useState("");
  const [showRevise, setShowRevise] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.getRevisions(id), api.listRuns(id)])
      .then(([c, r]) => {
        setError("");
        setChain(c);
        setRuns(r);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!chain || !runs) return <p role="status">Loading revisions</p>;

  const latestFinished = [...runs].reverse().find((r) => r.status === "finished");
  const hasBaseline = chain.length > 0;
  const blockedReason = !latestFinished ? "Run this project once before revising it." : "";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Revisions</h1>
        {!showRevise && (
          <Button disabled={Boolean(blockedReason)} onClick={() => setShowRevise(true)}>
            Revise
          </Button>
        )}
      </div>
      {blockedReason && <p className="text-sm text-soft-white/70">{blockedReason}</p>}

      {showRevise && (
        <ReviseDialog
          projectId={id}
          latestFinishedRun={latestFinished}
          hasBaseline={hasBaseline}
          onStarted={(run) => navigate(`/projects/${id}/result?run=${run.id}`)}
        />
      )}

      <Panel title="Chain">
        {hasBaseline ? (
          <RevisionChain chain={chain} onSelect={(entry) => navigate(`/projects/${id}/result?run=${entry.run_id}`)} />
        ) : (
          <p className="text-sm text-soft-white/70">No revisions yet. Revise once to start the chain.</p>
        )}
      </Panel>

      <Panel title="Compare">
        <CompareView projectId={id} chain={chain} />
      </Panel>
    </div>
  );
}
