import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../api/index.js";
import { config } from "../../config.js";
import Button from "../../components/ui/Button.jsx";
import ErrorState from "../../components/ui/ErrorState.jsx";
import { ALLOWED_EXTENSIONS, mergeFiles, validateFile } from "./validateFile.js";

const formatSize = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/** Upload panel. Without projectId it creates a project; with one it adds files to it. */
export default function UploadPanel({ projectId = null, preferences = {}, blocked = false }) {
  const navigate = useNavigate();
  const input = useRef(null);
  const sending = useRef(false);
  const [files, setFiles] = useState([]);
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  async function addFiles(list) {
    const accepted = [];
    const messages = [];
    for (const file of list) {
      const result = await validateFile(file, { maxMb: config.maxUploadMb });
      if (result.ok) accepted.push(file);
      else messages.push(`${file.name}: ${result.reason}`);
    }
    setFiles((current) => {
      const merged = mergeFiles(current, accepted, config.maxUploadFiles);
      setNotes([...messages, ...merged.notes]);
      return merged.files;
    });
  }

  function onDrop(event) {
    event.preventDefault();
    setDragging(false);
    const items = [...(event.dataTransfer?.items ?? [])];
    const dropped = items
      .filter((item) => item.kind === "file" && !item.webkitGetAsEntry?.()?.isDirectory)
      .map((item) => item.getAsFile())
      .filter(Boolean);
    const fallback = items.length ? [] : [...(event.dataTransfer?.files ?? [])];
    addFiles([...dropped, ...fallback]);
  }

  async function submit() {
    if (sending.current || files.length === 0 || blocked) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      let id = projectId;
      if (!id) {
        const base = files[0].name.replace(/\.[^.]+$/, "") || "Untitled";
        const project = await api.createProject({ name: base, preferences });
        id = project.id;
      }
      for (const file of files) await api.uploadFile(id, file);
      navigate(`/projects/${id}/mapping`);
    } catch (e) {
      setError(e?.message || "Upload failed.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-panel border border-dashed p-6 text-center ${dragging ? "border-soft-white bg-gunmetal" : "border-steel"}`}
      >
        <p className="text-sm">Drop Excel or CSV files here</p>
        <p className="mt-1 text-xs text-soft-white/70">
          {ALLOWED_EXTENSIONS.join(" ")} · up to {config.maxUploadFiles} files · {config.maxUploadMb} MB each
        </p>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          data-testid="file-input"
          accept={ALLOWED_EXTENSIONS.join(",")}
          onChange={(e) => {
            addFiles([...e.target.files]);
            e.target.value = "";
          }}
        />
        <Button variant="secondary" className="mt-3" onClick={() => input.current?.click()}>
          Choose files
        </Button>
      </div>

      {notes.length > 0 && (
        <ul role="status" className="mt-3 space-y-1 text-xs text-data-output">
          {notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Selected files">
          {files.map((file) => (
            <li key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-xl bg-gunmetal px-3 py-2 text-sm">
              <span className="truncate" title={file.name}>
                {file.name}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-soft-white/70">{formatSize(file.size)}</span>
                <button
                  type="button"
                  className="focus-ring rounded-full px-2 text-xs underline"
                  aria-label={`Remove ${file.name}`}
                  onClick={() => setFiles((c) => c.filter((f) => f !== file))}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-3">
          <ErrorState message={error} onRetry={submit} />
        </div>
      )}

      <Button className="mt-4" disabled={busy || blocked || files.length === 0} onClick={submit}>
        {busy ? "Uploading" : "Upload"}
      </Button>
    </div>
  );
}
