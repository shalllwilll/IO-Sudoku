import { useRef, useState } from "react";
import { api } from "../../api/index.js";
import { config } from "../../config.js";
import Button from "../../components/ui/Button.jsx";
import Input from "../../components/ui/Input.jsx";
import { ALLOWED_EXTENSIONS, validateFile } from "../upload/validateFile.js";
import { startRevisionRun } from "../run/runController.js";

/**
 * Uploads a revised file and starts the revision run. Runs the flow the backend's integration
 * notes describe: baseline the project's latest finished run if it has none yet, delete the old
 * upload(s), upload the revised file, then start the revision.
 *
 * There is no backend endpoint for a diff before the run starts, so this shows only what can
 * genuinely be checked ahead of time — the file itself — and the change summary appears on the
 * new run's Result page once it finishes (docs/contract-gaps.md).
 */
export default function ReviseDialog({ projectId, latestFinishedRun, hasBaseline, onStarted }) {
  const input = useRef(null);
  const busy = useRef(false);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);

  async function pick(list) {
    const chosen = list[0];
    if (!chosen) return;
    const result = await validateFile(chosen, { maxMb: config.maxUploadMb });
    if (!result.ok) {
      setFile(null);
      setFileError(result.reason);
      return;
    }
    setFile(chosen);
    setFileError("");
  }

  async function confirm() {
    if (busy.current || !file) return;
    busy.current = true;
    setWorking(true);
    setError("");
    try {
      if (!hasBaseline) {
        if (!latestFinishedRun) throw new Error("This project has no finished run to baseline yet.");
        await api.baseline(projectId, { run_id: latestFinishedRun.id });
      }
      const current = await api.listUploads(projectId);
      for (const upload of current) await api.deleteUpload(projectId, upload.id);
      await api.uploadFile(projectId, file);
      const run = await startRevisionRun(projectId, { label: label.trim() || undefined, fileNames: [file.name] });
      if (run) onStarted(run);
    } catch (e) {
      setError(e.message || "The revision could not be started.");
    } finally {
      busy.current = false;
      setWorking(false);
    }
  }

  return (
    <div className="space-y-3 rounded-panel border border-steel bg-carbon p-4">
      <h3 className="text-sm font-semibold">Revise with a new file</h3>
      <input
        ref={input}
        type="file"
        hidden
        data-testid="revise-file-input"
        accept={ALLOWED_EXTENSIONS.join(",")}
        onChange={(e) => {
          pick([...e.target.files]);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-3">
        <Button variant="secondary" onClick={() => input.current?.click()}>
          Choose file
        </Button>
        {file && <span className="text-sm">{file.name}</span>}
      </div>
      {fileError && (
        <p role="alert" className="text-xs text-data-tq">
          {fileError}
        </p>
      )}
      <Input label="Revision label (optional)" placeholder="Rev B" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={20} />
      {error && (
        <p role="alert" className="text-xs text-data-tq">
          {error}
        </p>
      )}
      <Button disabled={!file || working} onClick={confirm}>
        {working ? "Starting" : "Start revision"}
      </Button>
    </div>
  );
}
