import { Canvas } from "@react-three/fiber";
import { Component, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../../api/index.js";
import { config } from "../../config.js";
import { hasWebgl } from "../../scene/loadScene.js";
import ExplorerScene from "./ExplorerScene.jsx";
import FlowDiagram from "./FlowDiagram.jsx";
import RecordTable from "./RecordTable.jsx";
import { HardwareTree, IssueList, SelectionDetails } from "./Panels.jsx";
import { IoTypeBadge, SlotHoverCard, ValidationChecks } from "./IoPresentation.jsx";
import { ancestors, datasetFromRun } from "./model.js";
import { allocatedWorkbook } from "./directWorkbook.js";
import { inspectionRecords } from "./allocationPlayback.js";
import { IO_TYPES, SPARE_IO, UNKNOWN_IO } from "./ioTypes.js";
import { explorerStore } from "./store.js";
import useAllocationPlayback from "./useAllocationPlayback.js";
import "./explorer.css";

const INITIAL_CAMERA = { position: [0, 8, 45], fov: 42, near: 0.01, far: 2000 };
const GL_OPTIONS = { antialias: false, powerPreference: "high-performance" };
const NO_PATHS = [], MANUAL_OFF = { mode: "off", generation: 0 }, NOOP = () => {};
const initialView = () => ({ dataset: explorerStore.get(), selectedId: "overview", activeRecordId: null, issueId: null, picked: [], focus: { ids: ["overview"], serial: 0 } });

class SceneBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidUpdate(previous) { if (previous.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false }); }
  render() { return this.state.failed ? <div className="p-6"><p role="alert">The 3D view is unavailable. The allocation records and inspection details remain available below.</p>{this.props.fallback}</div> : this.props.children; }
}

export default function AllocationExplorer() {
  const [params] = useSearchParams();
  const [view, setView] = useState(initialView);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({ ioType: "", tq: "all" });
  const [drawer, setDrawer] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [fps, setFps] = useState(null);
  const worker = useRef(null), requestNumber = useRef(0), inFlight = useRef(false);
  const webgl = useMemo(() => hasWebgl(), []);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const { playback, snapshot, start, cancel, isRunning } = useAllocationPlayback();
  const { dataset } = view;
  const projectParam = params.get("project"), runParam = params.get("run");

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(media.matches);
    media?.addEventListener?.("change", change);
    return () => media?.removeEventListener?.("change", change);
  }, []);
  useEffect(() => () => { worker.current?.terminate(); requestNumber.current++; }, []);

  const installDataset = useCallback((next) => {
    explorerStore.set(next);
    setView((previous) => ({ dataset: next, selectedId: "overview", activeRecordId: null, issueId: null, picked: [], focus: { ids: ["overview"], serial: previous.focus.serial + 1 } }));
    setFilters({ ioType: "", tq: "all" }); setHoveredId(null); setDrawer(null); setError(""); setFps(null);
  }, []);
  useEffect(() => {
    if (!projectParam || !runParam) return undefined;
    let alive = true;
    const request = ++requestNumber.current;
    const load = async () => {
      if (config.mode !== "mock") throw new Error("Open an allocation workbook to inspect it locally. Live integration is not enabled.");
      const [layout, allocation, tqs, report] = await Promise.all([api.getLayout(projectParam, runParam), api.getAllocation(projectParam, runParam), api.getRunTqs(projectParam, runParam), api.getReport(projectParam, runParam)]);
      return datasetFromRun({ layout, allocation, tqs, report, projectId: projectParam, runId: runParam, mock: true });
    };
    load().then((next) => { if (alive && request === requestNumber.current) installDataset(next); }).catch((failure) => { if (alive && request === requestNumber.current) setError(failure.message); });
    return () => { alive = false; };
  }, [projectParam, runParam, installDataset]);

  const records = useMemo(() => dataset ? inspectionRecords(dataset, filters) : [], [dataset, filters]);
  const visibleIds = useMemo(() => new Set(records.map((record) => record.id)), [records]);
  const pickedIds = useMemo(() => new Set(view.picked), [view.picked]);
  const path = dataset ? ancestors(dataset, view.selectedId) : [];
  const selectedNode = dataset?.nodes.get(view.selectedId);
  const matchingSignals = records.filter((record) => record.active).length;

  const selectNode = useCallback((id) => {
    setView((previous) => previous.dataset?.nodes.has(id) ? { ...previous, selectedId: id, activeRecordId: null, issueId: null, focus: { ids: [id], serial: previous.focus.serial + 1 } } : previous);
    setDrawer("selection");
  }, []);
  const inspectRecord = useCallback((id) => {
    setView((previous) => { const record = previous.dataset?.recordMap.get(id); return !record ? previous : { ...previous, activeRecordId: id, selectedId: record.nodeId, issueId: null, focus: record.nodeId ? { ids: [record.nodeId], serial: previous.focus.serial + 1 } : previous.focus }; });
    setDrawer("selection");
  }, []);
  const inspectIssue = useCallback((id) => {
    setView((previous) => { const issue = previous.dataset?.issues.find((item) => item.id === id); return !issue ? previous : { ...previous, issueId: id, activeRecordId: null, selectedId: issue.nodeIds.length === 1 ? issue.nodeIds[0] : null, picked: issue.recordIds, focus: issue.nodeIds.length ? { ids: issue.nodeIds, serial: previous.focus.serial + 1 } : previous.focus }; });
    setDrawer("selection");
  }, []);
  const goBack = useCallback(() => setView((previous) => { const id = previous.dataset?.nodes.get(previous.selectedId)?.parentId ?? "overview"; return { ...previous, selectedId: id, activeRecordId: null, issueId: null, focus: { ids: [id], serial: previous.focus.serial + 1 } }; }), []);
  const focus = (ids) => setView((previous) => ({ ...previous, focus: { ids, serial: previous.focus.serial + 1 } }));
  const updateFps = useCallback((value) => setFps(value), []);
  useEffect(() => {
    const keydown = (event) => {
      if (event.target.closest?.("input, select, textarea, button, a") || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "Escape") { event.preventDefault(); goBack(); }
      if (event.key === "Home" || event.key.toLowerCase() === "f") { event.preventDefault(); setView((previous) => ({ ...previous, focus: { ids: [event.key === "Home" ? "overview" : previous.selectedId || "overview"], serial: previous.focus.serial + 1 } })); }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [goBack]);

  function chooseFile(next) {
    if (!next) return;
    requestNumber.current++; worker.current?.terminate(); worker.current = null; inFlight.current = false;
    cancel(); setBusy(false); setError(""); setFile(next); setHoveredId(null);
  }
  async function run() {
    if (!file || inFlight.current || isRunning()) return;
    const request = ++requestNumber.current;
    inFlight.current = true; setBusy(true); setError(""); cancel();
    try {
      if (file.size > 25 * 1024 * 1024) throw new Error("Choose a workbook smaller than 25 MB.");
      const buffer = await file.arrayBuffer();
      if (request !== requestNumber.current) return;
      const parser = new Worker(new URL("./workbook.worker.js", import.meta.url), { type: "module" }); worker.current = parser;
      const workbook = await new Promise((resolve, reject) => {
        parser.onmessage = ({ data }) => data.error ? reject(new Error(data.error)) : resolve(data.workbook);
        parser.onerror = () => reject(new Error("The workbook could not be opened. Reload the page and try again."));
        parser.postMessage({ buffer, name: file.name }, [buffer]);
      });
      if (request !== requestNumber.current) return;
      const next = allocatedWorkbook(workbook, dataset);
      installDataset(next); start(next, reducedMotion || !webgl || !next.counts.positions);
    } catch (failure) { if (request === requestNumber.current) setError(file.name + ": " + failure.message); }
    finally { if (request === requestNumber.current) { worker.current?.terminate(); worker.current = null; inFlight.current = false; setBusy(false); } }
  }

  const phaseLabel = snapshot.phase === "arrival" ? "Signals arriving from the field" : snapshot.phase === "filling" ? "Presenting " + (snapshot.current?.cabinet || dataset?.nodes.get(snapshot.activeCabinetId)?.label || "cabinet") : snapshot.phase === "outgoing" ? "Signals reaching the control room" : "Ready to inspect";
  return <main className={"allocation-explorer simple-explorer " + (dataset ? "has-dataset" : "is-start")}>
    <header className="explorer-header simple-header">
      <h1 className="text-xl font-semibold">IO Signal Sudoku</h1>
      <div className="simple-upload-row">
        <label className="simple-upload">Upload Excel workbook<input className="sr-only" aria-label="Excel workbook" type="file" accept=".xlsx,.xlsm,.csv" onChange={(event) => { chooseFile(event.target.files[0]); event.target.value = ""; }} /></label>
        {file && <span className="simple-filename" title={file.name}>{file.name}</span>}
        <button type="button" className="explorer-button explorer-button-primary simple-run" disabled={!file || busy || snapshot.running} onClick={run}>{busy ? "Loading…" : "Run"}</button>
      </div>
    </header>
    {error && <p role="alert" className="explorer-notice">{error}</p>}
    {busy && <p role="status" className="simple-loading">Opening your workbook…</p>}
    {dataset && <>
      <section className="simple-data-bar" aria-label="Active dataset"><span><strong>{dataset.name}</strong> · {dataset.counts.cabinets} cabinets · {matchingSignals} of {dataset.counts.signals} matching signals</span>
        <div className="simple-filters"><label className="explorer-field">I/O Type<select disabled={snapshot.running || busy} value={filters.ioType} onChange={(event) => setFilters((previous) => ({ ...previous, ioType: event.target.value }))}><option value="">All Signals</option>{Object.values(IO_TYPES).map((io) => <option key={io.code} value={io.code}>{io.code} — {io.name}</option>)}</select></label>
          <label className="explorer-field">TQ Status<select disabled={snapshot.running || busy} value={filters.tq} onChange={(event) => setFilters((previous) => ({ ...previous, tq: event.target.value }))}><option value="all">All</option><option value="raised">TQ Raised</option><option value="none">No TQ</option></select></label></div>
      </section>
      <section className="flow-layout" aria-label="Field to cabinets to control room" data-phase={snapshot.phase}>
        <FlowDiagram side="field" phase={snapshot.phase} />
        <section className="simple-cabinet-view" aria-label="Allocation viewport" data-render-fps={fps ?? ""}>
          <nav className="explorer-breadcrumb" aria-label="Hardware hierarchy"><button type="button" onClick={() => selectNode("overview")}>Overview</button>{path.filter((node) => node.type !== "overview").map((node) => <span key={node.id}> / <button type="button" onClick={() => selectNode(node.id)}>{node.label}</button></span>)}</nav>
          <div className="explorer-camera-toolbar" role="group" aria-label="Camera controls"><button type="button" className="explorer-button" disabled={!selectedNode || selectedNode.type === "overview"} onClick={goBack}>Parent</button><button type="button" className="explorer-button" onClick={() => focus([view.selectedId || "overview"])}>Fit selection</button><button type="button" className="explorer-button" onClick={() => focus(["overview"])}>Fit scene / reset</button>{["selection", "equipment", "issues", "records"].map((tab) => <button key={tab} type="button" className="explorer-button" onClick={() => setDrawer(tab)}>{tab === "selection" ? "Details" : tab === "equipment" ? "Equipment" : tab === "issues" ? "Issues (" + dataset.issues.length + ")" : "Records"}</button>)}</div>
          <div className="explorer-viewport simple-viewport">
            {webgl && dataset.counts.positions ? <SceneBoundary resetKey={dataset.id} fallback={<RecordTable records={records} onInspect={inspectRecord} />}><Canvas role="region" aria-label="Interactive schematic allocation scene" camera={INITIAL_CAMERA} dpr={[1, 1.5]} gl={GL_OPTIONS}>
              <color attach="background" args={["#111923"]} /><ExplorerScene dataset={dataset} selectedNodeId={view.selectedId} focusRequest={view.focus} visibleIds={visibleIds} selectedIds={pickedIds} filteredOnly={false} locked={false} reducedMotion={reducedMotion} playback={MANUAL_OFF} animationIds={NO_PATHS} onComplete={NOOP} onSelect={selectNode} onStats={updateFps} onHover={setHoveredId} reveal={playback} activeCabinetId={snapshot.activeCabinetId} showContext={false} />
            </Canvas></SceneBoundary> : <div className="explorer-viewport-fallback"><h2 className="text-lg font-semibold">{webgl ? "No assigned hardware to display" : "3D rendering is unavailable"}</h2><p className="mt-3 text-sm">{webgl ? "This workbook has no complete hardware assignments. Use an allocated workbook to display cabinets; the source records remain available below." : "Use the allocation records and inspection details below."}</p></div>}
            {dataset.nodes.get(hoveredId)?.type === "position" && <div className="explorer-hover-anchor"><SlotHoverCard node={dataset.nodes.get(hoveredId)} dataset={dataset} /></div>}
            <div className="simple-reveal-caption" aria-live="off">{snapshot.running && snapshot.current ? snapshot.current.code + " · " + snapshot.current.label + " · " + snapshot.current.baseplate + " / Channel " + snapshot.current.channel : "Drag to orbit · right-drag to pan · scroll to zoom · click to inspect"}</div>
          </div>
        </section>
        <FlowDiagram side="control" phase={snapshot.phase} />
      </section>
      <div className="simple-playback" data-phase={snapshot.phase}><p role="status">{phaseLabel}</p>{snapshot.running && <><progress max="100" value={snapshot.progress} aria-label="Allocation presentation progress" /><span aria-live="off">{snapshot.revealed} / {playback?.timeline.entries.length || 0} occupied positions presented</span></>}</div>
      <ul aria-label="I/O type color legend" className="explorer-legend simple-legend">{[...Object.values(IO_TYPES), SPARE_IO, UNKNOWN_IO].map((definition) => <li key={definition.code}><IoTypeBadge definition={definition} /></li>)}</ul>
      <footer className="explorer-summary"><span>{dataset.counts.records.toLocaleString()} source records · {dataset.counts.positions.toLocaleString()} positions · {dataset.counts.spares} spares</span><span>TQ / error outlines are separate from I/O colors. Engineering validation has not run.</span><Link to="/projects" className="underline">Projects</Link>{dataset.source === "run" && <Link className="underline" to={"/projects/" + dataset.projectId + "/result?run=" + dataset.runId}>2D results and reports</Link>}</footer>
      {(!webgl || !dataset.counts.positions) && <RecordTable records={records} onInspect={inspectRecord} />}
      {drawer && <aside className="simple-inspector" aria-label="Selection inspector"><div className="simple-inspector-heading"><h2>{drawer === "selection" ? "Inspection details" : drawer === "equipment" ? "Equipment" : drawer === "issues" ? "Issues and TQs" : "Allocation records"}</h2><button type="button" className="explorer-button" onClick={() => setDrawer(null)}>Close inspector</button></div>
        {drawer === "selection" && <><SelectionDetails dataset={dataset} selectedId={view.selectedId} activeRecordId={view.activeRecordId} issueId={view.issueId} onSelect={selectNode} onInspect={inspectRecord} /><ValidationChecks dataset={dataset} /></>}
        {drawer === "equipment" && <HardwareTree dataset={dataset} selectedId={view.selectedId} onSelect={selectNode} />}
        {drawer === "issues" && <IssueList compact dataset={dataset} records={records} selectedIssueId={view.issueId} onInspect={inspectIssue} />}
        {drawer === "records" && <RecordTable records={records} onInspect={inspectRecord} />}
      </aside>}
    </>}
  </main>;
}
