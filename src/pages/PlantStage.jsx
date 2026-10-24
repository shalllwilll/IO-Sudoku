import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { runStore, useRunState } from "../features/run/runStore.js";
import SceneRoot from "../scene/SceneRoot.jsx";
import WebglFallback from "../scene/WebglFallback.jsx";
import { Breadcrumb, LadderDiagram, Legend3D } from "../scene/Overlay.jsx";
import { useTour } from "../scene/Tour.jsx";
import { enter, exit, initialCameraState, initialWheel, jump, wheel } from "../scene/cameraMachine.js";
import { disposeShared } from "../scene/geometries.js";
import { hasWebgl, loadScene, resolveRun } from "../scene/loadScene.js";
import { locate, markersFor } from "../scene/lookup.js";
import { FOV } from "../scene/poses.js";
import { createView } from "../scene/viewStore.js";

const EXIT_IDLE_MS = 2500;

/** Development-only marker, so a TQ can be demonstrated without a run. Absent from a build. */
function devMarker(params) {
  const tag = params.get("demoTq");
  return tag
    ? { id: "dev-marker", code: "TQ-DEMO", severity: "assumed", status: "open", message: "Demonstration marker.", signal_keys: [], data: { tag } }
    : null;
}

/**
 * The presentation stage. It holds the canvas, the labels in it, one line of subtext, the ladder
 * diagram, the legend and one exit control: nothing else (T-6.6-7).
 */
export default function PlantStage() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ phase: "loading" });
  const [cam, setCam] = useState(initialCameraState);
  const [hover, setHover] = useState(null);
  const [picked, setPicked] = useState(null);
  const [showExit, setShowExit] = useState(true);

  const view = useMemo(() => createView(1), []);
  const wheelMemo = useRef(initialWheel);
  const stageRef = useRef(null);

  const webgl = useMemo(() => hasWebgl(), []);
  const instant = useMemo(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, []);

  useEffect(() => {
    let alive = true;
    resolveRun({ projectId: params.get("project"), runId: params.get("run") })
      .then(loadScene)
      .then((data) => {
        if (!alive) return;
        setState({ phase: "ready", ...data });
        const dev = import.meta.env.DEV ? devMarker(params) : null;
        const hit = dev && locate(data.scene, dev);
        if (hit) setCam((s) => jump(s, data.scene, hit.level, hit.ref));
      })
      .catch((error) => alive && setState({ phase: "error", message: error.message }));
    return () => {
      alive = false;
    };
  }, [params]);

  // Shared edge buffers are freed when the stage closes, so leaving the page leaves nothing behind.
  useEffect(() => disposeShared, []);

  const scene = state.scene ?? null;
  const ready = state.phase === "ready";

  const goEnter = useCallback((wanted) => setCam((s) => enter(s, scene, wanted)), [scene]);
  const goExit = useCallback(() => setCam((s) => exit(s, scene)), [scene]);
  const goJump = useCallback((level, wanted) => setCam((s) => jump(s, scene, level, wanted)), [scene]);

  const tour = useTour(goJump, { autoStart: false });
  const { running: touring, stop: stopTour, replay: replayTour } = tour;

  useEffect(() => {
    if (ready) replayTour();
  }, [ready, replayTour]);

  const interact = useCallback(() => {
    if (touring) stopTour();
  }, [touring, stopTour]);

  // The exit control stays out of the way until the mouse moves (T-6.6-8).
  useEffect(() => {
    let timer = setTimeout(() => setShowExit(false), EXIT_IDLE_MS);
    const onMove = () => {
      setShowExit(true);
      clearTimeout(timer);
      timer = setTimeout(() => setShowExit(false), EXIT_IDLE_MS);
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      clearTimeout(timer);
    };
  }, []);

  const run = useRunState();
  const tqs = useMemo(() => {
    const live = run.runId && run.runId === state.runId ? run.tqs : [];
    const dev = import.meta.env.DEV ? devMarker(params) : null;
    return [...(state.tqs ?? []), ...live, ...(dev ? [dev] : [])];
  }, [state.tqs, state.runId, run.runId, run.tqs, params]);

  const { markers, hidden, unplaced } = useMemo(
    () => (scene ? markersFor(scene, tqs) : { markers: [], hidden: 0, unplaced: 0 }),
    [scene, tqs],
  );

  const focusMarker = useCallback(
    (marker) => {
      stopTour();
      setPicked(marker);
      setCam((s) => jump(s, scene, marker.level, marker.ref));
    },
    [scene, stopTour],
  );

  // A TQ raised while the stage is open takes the camera to it and ends the tour (T-6.7-13).
  // The run store is the external source here, so the move happens in its callback.
  useEffect(() => {
    if (!scene) return undefined;
    let known = new Set(runStore.getState().tqs.map((t) => t.id));
    return runStore.subscribe(() => {
      const raised = runStore.getState().tqs;
      const fresh = raised.find((t) => !known.has(t.id));
      known = new Set(raised.map((t) => t.id));
      if (!fresh) return;
      const hit = locate(scene, fresh);
      if (hit) focusMarker({ ...fresh, ...hit, line: fresh.message });
    });
  }, [scene, focusMarker]);

  // The wheel listener is attached by hand because React's is passive: preventDefault inside it is
  // refused, and the browser logs an error for every event. Keys listen on the window, so Escape
  // works without clicking the canvas first.
  useEffect(() => {
    const node = stageRef.current;
    if (!node || !scene) return undefined;

    const onWheel = (event) => {
      event.preventDefault();
      interact();
      const out = wheel(cam, scene, event.deltaY, wheelMemo.current);
      wheelMemo.current = out.memo;
      setCam(out.state);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape" && event.key !== "Backspace") return;
      event.preventDefault();
      interact();
      goExit();
    };

    node.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    return () => {
      node.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [cam, scene, interact, goExit]);

  if (!webgl) return <WebglFallback counts={scene?.counts} />;
  if (state.phase === "error") {
    return (
      <div className="mx-auto max-w-xl p-8 text-soft-white">
        <h1 className="text-2xl font-semibold">3D plant view</h1>
        <p role="alert" className="mt-2 text-sm text-data-tq">
          {state.message}
        </p>
        <Link className="focus-ring mt-6 inline-block rounded-full bg-soft-white px-5 py-2 text-sm font-medium text-graphite" to="/projects">
          Back to the dashboard
        </Link>
      </div>
    );
  }

  return (
    <div ref={stageRef} className="fixed inset-0 bg-black text-soft-white" role="application" aria-label="3D plant view">
      {ready ? (
        <Canvas
          camera={{ fov: FOV, near: 0.01, far: 400, position: [0, 6, 26] }}
          dpr={[1, 1.75]}
          onPointerMissed={() => {
            setPicked(null);
            interact();
          }}
        >
          <color attach="background" args={["#000000"]} />
          <SceneRoot
            scene={scene}
            cam={cam}
            view={view}
            markers={markers}
            hover={hover}
            setHover={setHover}
            onEnter={(wanted) => {
              interact();
              goEnter(wanted);
            }}
            picked={picked}
            onPick={focusMarker}
            instant={instant}
          />
        </Canvas>
      ) : (
        <p role="status" className="p-8 text-sm">
          Loading the scene
        </p>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-5">
        <div className="pointer-events-auto">
          <Breadcrumb
            cam={cam}
            onJump={(level) => {
              interact();
              goJump(level);
            }}
          />
        </div>
        <div className="pointer-events-auto flex items-center gap-3">
          {touring ? (
            <button type="button" className="focus-ring rounded-full border border-steel px-3 py-1 text-xs" onClick={stopTour}>
              Skip
            </button>
          ) : (
            <button type="button" className="focus-ring rounded-full border border-steel px-3 py-1 text-xs" onClick={replayTour}>
              Replay
            </button>
          )}
          {showExit && (
            <Link className="focus-ring rounded-full border border-steel px-3 py-1 text-xs" to="/projects">
              Leave
            </Link>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-3 p-5">
        <p className="text-sm text-soft-white/90">{tour.step?.subtext}</p>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="pointer-events-auto">
            <LadderDiagram
              level={cam.level}
              onJump={(level) => {
                interact();
                goJump(level);
              }}
            />
          </div>
          <Legend3D />
        </div>
        {(hidden > 0 || unplaced > 0) && (
          <p className="text-xs text-soft-white/70">
            {hidden > 0 && `${hidden} more TQs are not shown. `}
            {unplaced > 0 && `${unplaced} ${unplaced === 1 ? "TQ has" : "TQs have"} no position in this scene.`}
          </p>
        )}
      </div>
    </div>
  );
}
