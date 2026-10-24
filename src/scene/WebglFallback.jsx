import { Link } from "react-router-dom";
import { LEVELS } from "./cameraMachine.js";

/**
 * Shown when the browser cannot give us WebGL. The same seven levels as a still diagram, so the
 * demonstration can still be explained, with a way back to the dashboard.
 */
export default function WebglFallback({ counts }) {
  return (
    <div className="mx-auto max-w-2xl p-8 text-soft-white">
      <h1 className="text-2xl font-semibold">3D plant view is unavailable</h1>
      <p className="mt-2 text-sm text-soft-white/80">
        This browser cannot run WebGL, so the scene cannot be drawn. The same seven levels are listed below, and every
        number in them is also on the Result page.
      </p>
      <ol className="mt-6 space-y-2">
        {LEVELS.map((l) => (
          <li key={l.level} className="rounded-xl border border-steel p-3 text-sm">
            <strong>
              Level {l.level}: {l.name}
            </strong>
            <span className="block text-xs text-soft-white/70">{l.subtext}</span>
          </li>
        ))}
      </ol>
      {counts && (
        <p className="mt-4 text-xs text-soft-white/70">
          This run: {counts.cabinets} cabinets, {counts.ciocs} CIOCs, {counts.baseplates} baseplates, {counts.positions} positions.
        </p>
      )}
      <Link className="focus-ring mt-6 inline-block rounded-full bg-soft-white px-5 py-2 text-sm font-medium text-graphite" to="/projects">
        Back to the dashboard
      </Link>
    </div>
  );
}
