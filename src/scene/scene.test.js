import { describe, expect, it } from "vitest";
import { buildResult } from "../api/mock/resultFixture.js";
import { MAX_LEVEL, canShow, enter, exit, initialCameraState, initialWheel, jump, resolveTarget, trail, wheel, WHEEL_COOLDOWN_MS, WHEEL_THRESHOLD } from "./cameraMachine.js";
import { baseplateY, cabinetX, channelX, framed } from "./layout3d.js";
import { locate, markersFor, MAX_MARKERS } from "./lookup.js";
import { easeInOut, effectiveLevel, poseFor, shellOpacity, tweenPose } from "./poses.js";
import { buildScene, ciocLabel, positionAt } from "./sceneModel.js";
import { tourSteps } from "./tourScript.js";

const result = buildResult();
const scene = buildScene(result.layout, result.allocation, result.tqs);
const deep = { cabinet: 1, cioc: 1, baseplate: 1, channel: 1 };

describe("scene model", () => {
  it("reproduces the dataset counts", () => {
    expect(scene.counts).toMatchObject({ cabinets: 3, ciocs: 12, baseplates: 96, positions: 1152, placements: 211 });
    expect(scene.cabinets.every((c) => c.ciocs.length === 4)).toBe(true);
    expect([...scene.cioc.values()].every((c) => c.baseplates.length === 8)).toBe(true);
  });

  it("classifies every position exactly once", () => {
    const { byState } = scene.counts;
    expect(Object.values(byState).reduce((a, b) => a + b, 0)).toBe(1152);
    // 177 field signals, three of which an open TQ names; 12 cabinet alarms on reserved baseplates.
    expect(byState.input + byState.output + byState.tq).toBe(177);
    expect(byState.tq).toBe(3);
    expect(byState.wiredSpare).toBe(22);
    expect(1152 - scene.counts.placements).toBe(941); // spare positions, as in the dataset
  });

  it("keys a baseplate by its CIOC, because the names repeat across cabinets", () => {
    const names = [...scene.cioc.values()].flatMap((c) => c.baseplates.map((b) => b.name));
    expect(new Set(names).size).toBeLessThan(names.length);
    const keys = [...scene.cioc.values()].flatMap((c) => c.baseplates.map((b) => `${c.no}:${b.n}`));
    expect(new Set(keys).size).toBe(96);
  });

  it("labels a CIOC and finds a position from the data", () => {
    const cioc = scene.cioc.get(1);
    expect(ciocLabel(cioc)).toContain(cioc.name);
    expect(positionAt(scene, deep).channel).toBe(1);
    expect(positionAt(scene, { ...deep, channel: 99 })).toBeNull();
  });
});

describe("camera machine", () => {
  it("enters levels 1 to 7 in order, then stays", () => {
    let s = initialCameraState;
    const seen = [s.level];
    for (let i = 0; i < 8; i++) {
      s = enter(s, scene);
      seen.push(s.level);
    }
    expect(seen).toEqual([1, 2, 3, 4, 5, 6, 7, 7, 7]);
    expect(s.target).toMatchObject({ cabinet: 1, cioc: 1, baseplate: 1, channel: 1 });
  });

  it("exits back to level 1 and stays there", () => {
    let s = jump(initialCameraState, scene, 7);
    for (let i = 0; i < 8; i++) s = exit(s, scene);
    expect(s.level).toBe(1);
  });

  it("jumps straight to a level and keeps the breadcrumb honest", () => {
    const s = jump(jump(initialCameraState, scene, 5), scene, 2);
    expect(s.level).toBe(2);
    expect(trail(s).map((t) => t.level)).toEqual([1, 2]);
    expect(trail(jump(s, scene, 7)).map((t) => t.level)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("moves to another cabinet without skipping a level", () => {
    const s = jump(initialCameraState, scene, 3, { cabinet: 1 });
    expect(jump(s, scene, 3, { cabinet: 2 })).toMatchObject({ level: 3, target: { cabinet: 2 } });
  });

  it("rejects a target the scene does not have, leaving the state alone", () => {
    const s = jump(initialCameraState, scene, 3);
    expect(jump(s, scene, 5, { cioc: 999 })).toMatchObject({ target: { cioc: 1 } });
    expect(resolveTarget(scene, 7, { cabinet: 99 })).toMatchObject({ cabinet: 1 });
    expect(resolveTarget({ cabinets: [], cioc: new Map() }, 3, {})).toBeNull();
    expect(canShow(scene, 5, { cabinet: 1 })).toBe(false); // level 5 needs a CIOC
    expect(canShow(scene, 8, deep)).toBe(false);
    expect(canShow(scene, 7, deep)).toBe(true);
  });

  it("moves one level for a quick trackpad burst, however many events it sends", () => {
    let s = jump(initialCameraState, scene, 2);
    let memo = initialWheel;
    for (let i = 0; i < 50; i++) {
      const out = wheel(s, scene, -20, memo, 1000); // one flick: 50 events, same instant
      s = out.state;
      memo = out.memo;
    }
    expect(s.level).toBe(3);

    // Once the camera has had time to arrive, the wheel works again, in both directions.
    expect(wheel(s, scene, -WHEEL_THRESHOLD, memo, 1000 + WHEEL_COOLDOWN_MS).state.level).toBe(4);
    expect(wheel(s, scene, WHEEL_THRESHOLD, memo, 1000 + WHEEL_COOLDOWN_MS).state.level).toBe(2);

    // Deltas below the threshold on their own do not move at all.
    const small = wheel(s, scene, -10, initialWheel, 9000);
    expect(small.state.level).toBe(3);
    expect(small.memo.accumulated).toBe(-10);
  });
});

describe("poses and fades", () => {
  it("frames each level on its own subject", () => {
    // Levels 1 to 6 all look at the front of the cabinets, each one tighter than the last.
    const widths = [1, 2, 3, 4, 5, 6].map((l) => framed(scene, l, deep).halfX);
    expect(widths).toEqual([...widths].sort((a, b) => b - a));
    // Level 7 turns to the side and frames the depth of one channel, so it is the only level whose
    // width is not a width of the cabinet face; its height is still the tightest of all.
    expect(framed(scene, 7, deep).halfY).toBeLessThan(framed(scene, 6, deep).halfY);
    expect(framed(scene, 7, deep).centre[0]).toBeCloseTo(channelX(framed(scene, 5, deep).centre[0], 1), 5);
    expect(framed(scene, 6, { ...deep, baseplate: 8 }).centre[1]).toBeCloseTo(baseplateY(8), 5);
    expect(cabinetX(0, 3)).toBeLessThan(cabinetX(2, 3));
  });

  it("tweens from one pose to the other with no snap at either end", () => {
    const from = poseFor(scene, 1, {});
    const to = poseFor(scene, 7, deep);
    expect(tweenPose(from, to, 0).position).toEqual(from.position);
    expect(tweenPose(from, to, 1).position[0]).toBeCloseTo(to.position[0], 5);
    expect(tweenPose(from, to, 1).lookAt).toEqual(to.lookAt);
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 5);
    // The path bows upwards part way, so a long move reads as travel rather than a cut.
    expect(tweenPose(from, to, 0.5).position[1]).toBeGreaterThan(Math.min(from.position[1], to.position[1]));
  });

  it("fades a shell only across its own level", () => {
    expect(shellOpacity(4, 3)).toBe(1);
    expect(shellOpacity(4, 3.5)).toBeCloseTo(0.5, 5);
    expect(shellOpacity(4, 4)).toBe(0);
    expect(shellOpacity(4, 6)).toBe(0);
    expect(effectiveLevel(3, 4, 0)).toBe(3);
    expect(effectiveLevel(3, 4, 1)).toBe(4);
    // Going out mirrors going in, so the wheel and a click give the same curve.
    expect(shellOpacity(4, effectiveLevel(4, 3, 0.25))).toBeCloseTo(1 - shellOpacity(4, effectiveLevel(3, 4, 0.25)), 5);
  });
});

describe("TQ lookup", () => {
  const tq = result.tqs[0];
  const placed = () => positionAt(scene, locate(scene, tq).ref).placement.signal;

  it("finds a signal by the key the backend gives", () => {
    expect(locate(scene, tq)).toMatchObject({ level: 6, how: "signal" });
  });

  it("falls back to the tag, however it is spaced or cased", () => {
    const tag = placed().tag;
    expect(locate(scene, { signal_keys: [], data: { tag: tag.toLowerCase().replace("-", "-  ") } })).toMatchObject({ level: 6, how: "tag" });
  });

  it("falls back to cable and pair, then to the cable alone at cabinet level", () => {
    const hit = placed();
    expect(locate(scene, { signal_keys: [], data: { cable: hit.cable, pair: hit.pair } })).toMatchObject({ how: "cable and pair", level: 6 });
    expect(locate(scene, { signal_keys: [], data: { cable: hit.cable } })).toMatchObject({ how: "cable", level: 3 });
  });

  it("gives nothing for a TQ that names nothing in the scene", () => {
    expect(locate(scene, { signal_keys: ["nowhere:1"], data: { tag: "NOPE", cable: "NOPE" } })).toBeNull();
    expect(locate(scene, {})).toBeNull();
  });

  it("counts one marker per TQ, skips answered ones and caps the visible markers", () => {
    expect(markersFor(scene, [tq, { ...tq }]).markers).toHaveLength(1);
    expect(markersFor(scene, result.tqs).unplaced).toBe(1); // the TQ that names no signal
    expect(markersFor(scene, result.tqs).markers.every((m) => m.severity)).toBe(true);

    const many = [...scene.keyIndex.keys()].slice(0, 200).map((key, i) => ({ id: `t${i}`, code: "TQ-DATA", status: "open", signal_keys: [key] }));
    const out = markersFor(scene, many);
    expect(out.markers).toHaveLength(MAX_MARKERS);
    expect(out.hidden).toBe(many.length - MAX_MARKERS);
  });
});

describe("tour script", () => {
  it("visits every level in order and rests on level 1", () => {
    expect(tourSteps.map((s) => s.level)).toEqual([1, 2, 3, 4, 5, 6, 7, 1]);
    expect(tourSteps.at(-1).last).toBe(true);
    expect(tourSteps.every((s) => s.subtext.length > 0)).toBe(true);
    expect(tourSteps.filter((s) => !s.last).every((s) => s.dwellMs >= 2000)).toBe(true);
    expect(MAX_LEVEL).toBe(7);
  });
});
