import { useCallback, useEffect, useRef, useState } from "react";
import { createAllocationPlayback } from "./allocationPlayback.js";

const IDLE = { phase: "complete", running: false, progress: 100, revealed: 0, activeCabinetId: null, current: null };

export default function useAllocationPlayback() {
  const current = useRef(null);
  const [playback, setPlayback] = useState(null);
  const [snapshot, setSnapshot] = useState(IDLE);
  const start = useCallback((dataset, reducedMotion) => {
    current.current?.cancel();
    const next = createAllocationPlayback(dataset, { reducedMotion });
    current.current = next; setPlayback(next); setSnapshot(next.current);
  }, []);
  const cancel = useCallback(() => {
    if (current.current) setSnapshot(current.current.cancel());
  }, []);
  useEffect(() => {
    if (!playback || !playback.current.running) return undefined;
    let frame, lastUi = 0, previousPhase = "", previousCabinet = null;
    const tick = (time) => {
      const next = playback.advance(time);
      if (time - lastUi >= 100 || !next.running || next.phase !== previousPhase || next.activeCabinetId !== previousCabinet) {
        lastUi = time; previousPhase = next.phase; previousCabinet = next.activeCabinetId;
        setSnapshot(next);
      }
      if (next.running) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); playback.cancel(); };
  }, [playback]);
  useEffect(() => () => current.current?.cancel(), []);
  return { playback, snapshot, start, cancel, isRunning: () => Boolean(current.current?.current.running) };
}
