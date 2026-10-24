// Which run the stage shows, and turning it into a scene.
//
// The stage is opened from the dashboard with no project in hand, so it finds the newest finished
// run by itself. With none to show it says so, except in mock mode, where the built-in sample run
// stands in and the demonstration can be rehearsed with no project set up.
import { api } from "../api/index.js";
import { config } from "../config.js";
import { RUN_STATUS } from "../api/live/wire.js";
import { buildScene } from "./sceneModel.js";

const PROJECTS_SEARCHED = 5;
export const SAMPLE_RUN = { projectId: "sample", runId: "sample", sample: true };

/** Newest finished run across the most recent projects, or null. */
export async function latestFinishedRun() {
  const projects = await api.listProjects();
  for (const project of projects.slice(-PROJECTS_SEARCHED).reverse()) {
    const runs = await api.listRuns(project.id);
    const finished = runs.filter((r) => r.status === RUN_STATUS.finished);
    if (finished.length) return { projectId: project.id, runId: finished[finished.length - 1].id };
  }
  return null;
}

/** Resolves which run to show. Throws a plain Error when there is nothing to show. */
export async function resolveRun({ projectId, runId }) {
  if (projectId && runId) return { projectId, runId };
  const found = await latestFinishedRun();
  if (found) return found;
  if (config.mode === "mock") return SAMPLE_RUN;
  throw new Error("No finished run yet. Run an allocation first, then open the 3D view.");
}

/** Loads a run's layout, allocation and TQs and builds the scene. */
export async function loadScene({ projectId, runId }) {
  const [layout, allocation, tqs] = await Promise.all([
    api.getLayout(projectId, runId),
    api.getAllocation(projectId, runId),
    api.getRunTqs(projectId, runId),
  ]);
  return { scene: buildScene(layout, allocation, tqs), tqs, projectId, runId };
}

/** True when this browser can run the scene at all (T-6.6-9). */
export function hasWebgl() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}
