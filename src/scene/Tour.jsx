import { useCallback, useEffect, useState } from "react";
import { useRef } from "react";
import { tourSteps } from "./tourScript.js";

const LAST = tourSteps.length - 1;

/**
 * Walks the tour script. It only calls the camera machine, so it can never reach a state the user
 * could not reach themselves, and any interaction hands control straight back (T-6.6-4).
 *
 * A hidden tab pauses rather than racing on, so returning to it continues at the step it was on
 * with the time it had left (T-6.6-6).
 */
export function useTour(jumpTo, { autoStart = true } = {}) {
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(!autoStart);
  const [paused, setPaused] = useState(() => typeof document !== "undefined" && document.hidden);
  const left = useRef(null);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (stopped) return undefined;
    const step = tourSteps[index];
    if (!step) return undefined;
    jumpTo(step.level);
    // The last step is where the tour rests, so nothing is scheduled after it.
    if (step.last || paused) return undefined;

    const wait = left.current ?? step.dwellMs;
    const startedAt = Date.now();
    let fired = false;
    const timer = setTimeout(() => {
      fired = true;
      left.current = null;
      setIndex((i) => i + 1);
    }, wait);
    return () => {
      clearTimeout(timer);
      // Interrupted by a pause rather than by the timer: keep what was left of the dwell.
      if (!fired) left.current = Math.max(0, wait - (Date.now() - startedAt));
    };
  }, [index, stopped, paused, jumpTo]);

  const stop = useCallback(() => {
    left.current = null;
    setStopped(true);
  }, []);

  const replay = useCallback(() => {
    left.current = null;
    setIndex(0);
    setStopped(false);
  }, []);

  const step = tourSteps[Math.min(index, LAST)];
  return { running: !stopped && index < LAST, stop, replay, step, index };
}
