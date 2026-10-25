import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/index.js";
import FileChip from "../components/FileChip.jsx";
import Button from "../components/ui/Button.jsx";
import EmptyState from "../components/ui/EmptyState.jsx";
import ErrorState from "../components/ui/ErrorState.jsx";
import Tabs from "../components/ui/Tabs.jsx";
import ChatTab from "../features/result/ChatTab.jsx";
import CabinetGrid from "../features/result/CabinetGrid.jsx";
import CabinetRail from "../features/result/CabinetRail.jsx";
import DeclarationTab from "../features/result/DeclarationTab.jsx";
import DownloadsTab from "../features/result/DownloadsTab.jsx";
import ImpactTab from "../features/result/ImpactTab.jsx";
import InfoBox, { describeSelection } from "../features/result/InfoBox.jsx";
import Legend from "../features/result/Legend.jsx";
import ReportTab from "../features/result/ReportTab.jsx";
import TqTab from "../features/result/TqTab.jsx";
import { cellState } from "../features/result/cellState.js";
import { buildModel, cabinetOf, isTq } from "../features/result/resultModel.js";
import ProgressPanel from "../features/run/ProgressPanel.jsx";
import { useRunState } from "../features/run/runStore.js";
import { highlightKeysFor } from "../features/revisions/gridHighlight.js";

const BASE_TABS = [
  { id: "report", label: "Report" },
  { id: "tqs", label: "TQs" },
  { id: "declaration", label: "Declaration" },
  { id: "chat", label: "Chat" },
  { id: "downloads", label: "Downloads" },
];

const reduced = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function Result() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const runId = params.get("run");
  const run = useRunState();

  const live = run.runId === runId;
  const waiting = live && run.status === "running";
  const ended = live && (run.status === "failed" || run.status === "cancelled");

  const [data, setData] = useState(null);
  const [tqs, setTqs] = useState([]);
  const [impact, setImpact] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("report");
  const [cabinetNo, setCabinetNo] = useState(null);
  const [selection, setSelection] = useState(null); // { sel, anchor }
  const [visible, setVisible] = useState(Infinity);
  const frame = useRef(0);
  const highlightTags = params.get("highlight");

  const replay = useCallback((total) => {
    cancelAnimationFrame(frame.current);
    if (reduced()) return setVisible(Infinity);
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 1500);
      setVisible(Math.floor(t * total) + (t >= 1 ? Infinity : 0));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    setVisible(0);
    frame.current = requestAnimationFrame(step);
  }, []);

  const fromLiveRun = live && run.status === "finished";
  const load = useCallback(() => {
    Promise.all([api.getLayout(id, runId), api.getAllocation(id, runId), api.getReport(id, runId), api.getRunTqs(id, runId)])
      .then(([layout, allocation, report, list]) => {
        setError("");
        setData({ layout, allocation, report });
        setTqs(list);
        if (fromLiveRun) replay(allocation.placements.length);
      })
      .catch((e) => setError(e.message));
    // The impact tab is optional: a run with no impact just hides the tab, so its failure never
    // blocks the rest of the page.
    api
      .getImpact(id, runId)
      .then(setImpact)
      .catch(() => setImpact(null));
  }, [id, runId, fromLiveRun, replay]);

  useEffect(() => {
    if (!runId || waiting || ended) return undefined;
    load();
    return () => cancelAnimationFrame(frame.current);
  }, [runId, waiting, ended, load]);

  const model = useMemo(() => (data ? buildModel(data.layout, data.allocation, tqs) : null), [data, tqs]);

  const highlightKeys = useMemo(
    () => (model && highlightTags ? highlightKeysFor(model, highlightTags.split(",")) : null),
    [model, highlightTags],
  );

  // Arriving with ?highlight=... (from a compare view) starts on the first changed cabinet, until
  // the user picks one themselves.
  const highlightCabinet = useMemo(() => {
    if (!model || !highlightKeys?.size) return null;
    const first = model.placements.find((p) => highlightKeys.has(`${p.cioc_no}:${p.baseplate}:${p.channel}`));
    return first ? cabinetOf(model, first.cioc_no) : null;
  }, [model, highlightKeys]);

  const showPlacement = useCallback(
    (p) => {
      const key = `${p.cioc_no}:${p.baseplate}:${p.channel}`;
      setCabinetNo(cabinetOf(model, p.cioc_no));
      setSelection({ sel: { kind: "cell", key, state: "tq" }, anchor: null });
      requestAnimationFrame(() => {
        const node = document.querySelector(`[data-pos="${key}"]`);
        node?.focus();
        setSelection({ sel: { kind: "cell", key, state: cellState({ placement: p, baseplateUsed: true, hasTq: isTq(model, p) }) }, anchor: node });
      });
    },
    [model],
  );

  const close = useCallback(() => setSelection(null), []);

  if (!runId) return <Navigate to={`/projects/${id}/run`} replace />;
  const chip = <FileChip names={run.fileNames.length ? run.fileNames : ["Uploaded files"]} />;

  if (waiting || ended) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          {chip}
          <h1 className="text-2xl font-semibold">Result</h1>
        </div>
        <ProgressPanel />
        {ended && <Link className="underline" to={`/projects/${id}/run`}>Back to the run page</Link>}
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!model) return <p role="status">Loading result</p>;

  const activeCabinet = cabinetNo ?? highlightCabinet ?? (model.perCabinet.find((c) => c.occupied > 0) ?? model.perCabinet[0])?.no;
  const info = selection ? describeSelection(model, selection.sel) : null;
  const selectedKey = selection?.sel.kind === "cell" ? selection.sel.key : null;
  const tabs = impact?.available ? [...BASE_TABS.slice(0, 3), { id: "impact", label: "Impact" }, ...BASE_TABS.slice(3)] : BASE_TABS;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {chip}
        <h1 className="text-2xl font-semibold">Result</h1>
        <Link className="focus-ring rounded-full border border-steel px-3 py-1.5 text-xs" to={`/plant?project=${encodeURIComponent(id)}&run=${encodeURIComponent(runId)}`}>3D Allocation Explorer</Link>
        <Button variant="secondary" className="ml-auto" onClick={() => replay(model.placements.length)}>
          Replay
        </Button>
      </div>

      {model.placements.length === 0 && model.signalCount === 0 ? (
        <EmptyState title="No signals were placed">This run produced no allocation.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          <section aria-label="Allocation view" className="min-w-0 space-y-3">
            <CabinetRail
              cabinets={model.perCabinet}
              selected={activeCabinet}
              onSelect={(no, node) => {
                setCabinetNo(no);
                setSelection({ sel: { kind: "cabinet", no }, anchor: node ?? null });
              }}
            />
            <CabinetGrid
              model={model}
              cabinetNo={activeCabinet}
              visibleCount={visible}
              selectedKey={selectedKey}
              highlightKeys={highlightKeys}
              onSelect={(sel, node) => setSelection({ sel, anchor: node })}
            />
            <Legend />
          </section>

          <section aria-label="Details" className="min-w-0 space-y-3">
            <Tabs tabs={tabs} value={tab} onChange={setTab} idPrefix="result" />
            <div role="tabpanel" id={`result-${tab}-panel`} aria-labelledby={`result-${tab}-tab`} className="rounded-panel border border-steel bg-carbon p-4">
              {tab === "report" && <ReportTab report={data.report} model={model} tqs={tqs} />}
              {tab === "tqs" && (
                <TqTab
                  projectId={id}
                  tqs={tqs}
                  report={data.report}
                  model={model}
                  onShow={showPlacement}
                  onAnswered={(updated) => setTqs((list) => list.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)))}
                />
              )}
              {tab === "declaration" && <DeclarationTab report={data.report} />}
              {tab === "impact" && impact?.available && <ImpactTab impact={impact.impact} />}
              {tab === "chat" && <ChatTab runId={runId} report={data.report} tqs={tqs} />}
              {/* Reaching here means the layout/allocation/report calls above already succeeded,
                  which the backend only allows for a finished run. */}
              {tab === "downloads" && <DownloadsTab projectId={id} runId={runId} report={data.report} tqs={tqs} impact={impact} />}
            </div>
          </section>
        </div>
      )}

      {info && (
        <InfoBox
          info={info}
          anchor={selection.anchor}
          onClose={close}
        />
      )}
    </div>
  );
}
