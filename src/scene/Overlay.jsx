// The only DOM the stage shows over the canvas: breadcrumb, the seven-step ladder, the legend and
// one line of subtext. No side panel and no filters: the presentation screen holds the scene
// (T-6.6-7). Consolidates the playbook's Breadcrumb, LadderDiagram and Legend3D.
import { LEVELS, trail } from "./cameraMachine.js";
import { LEGEND_3D, STATE_3D } from "./stateStyle3d.js";

export function Breadcrumb({ cam, onJump }) {
  const steps = trail(cam);
  return (
    <nav aria-label="Camera levels" className="flex flex-wrap items-center gap-1 text-xs">
      {steps.map((step, i) => (
        <span key={step.level} className="flex items-center gap-1">
          {i > 0 && <span className="text-soft-white/40">/</span>}
          <button
            type="button"
            className={`focus-ring rounded px-1 ${step.level === cam.level ? "text-soft-white" : "text-soft-white/60 hover:text-soft-white"}`}
            aria-current={step.level === cam.level ? "step" : undefined}
            onClick={() => onJump(step.level)}
          >
            {step.name}
          </button>
        </span>
      ))}
    </nav>
  );
}

/** The seven-step ladder, with the level in view highlighted. */
export function LadderDiagram({ level, onJump }) {
  return (
    <ol aria-label="The seven levels" className="flex items-center gap-1">
      {LEVELS.map((l) => {
        const here = l.level === level;
        return (
          <li key={l.level}>
            <button
              type="button"
              aria-current={here ? "step" : undefined}
              aria-label={`Level ${l.level}: ${l.name}`}
              onClick={() => onJump?.(l.level)}
              className={`focus-ring h-1.5 w-8 rounded-full ${here ? "bg-soft-white" : "bg-steel"}`}
            />
          </li>
        );
      })}
    </ol>
  );
}

export function Legend3D() {
  return (
    <ul aria-label="Legend" className="flex flex-wrap items-center gap-3 text-xs">
      {LEGEND_3D.map((entry) => (
        <li key={entry.state} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: STATE_3D[entry.state].color }} />
          <span className="text-soft-white/80">
            {entry.label}
            {entry.glyph && <span aria-hidden="true" className="ml-1 text-soft-white/50">{entry.glyph}</span>}
          </span>
        </li>
      ))}
    </ul>
  );
}
