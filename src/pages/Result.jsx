import { Navigate, useParams, useSearchParams } from "react-router-dom";
import FileChip from "../components/FileChip.jsx";
import ProgressPanel from "../features/run/ProgressPanel.jsx";
import { useRunState } from "../features/run/runStore.js";

// Stub for M4.2. M5.1 replaces the body with the 2D allocation view and the tabbed panel.
export default function Result() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const run = useRunState();
  const runId = params.get("run");

  if (!runId) return <Navigate to={`/projects/${id}/run`} replace />;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FileChip names={run.fileNames.length ? run.fileNames : ["Uploaded files"]} />
        <h1 className="text-2xl font-semibold">Result</h1>
      </div>
      <ProgressPanel />
    </div>
  );
}
