import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { FOV, effectiveLevel, poseFor, tweenPose } from "./poses.js";

const TWEEN_MS = 1400; // --t-3d (MI-8)

/**
 * Moves the camera to whatever pose the machine's state asks for. Free orbit is off on purpose:
 * the presenter drives the view.
 *
 * A new target starts a tween from where the camera actually is, not from the previous target, so
 * acting during a move continues from the current pose with no snap (T-6.3-7).
 */
export default function CameraRig({ scene, cam, view, instant = false }) {
  const { camera } = useThree();
  const tween = useRef(null);

  useEffect(() => {
    const to = poseFor(scene, cam.level, cam.target, camera.aspect);
    const was = view.get();
    const from = { position: camera.position.toArray(), lookAt: [...was.lookAt], fov: camera.fov || FOV };
    tween.current = { from, to, fromLevel: was.level, toLevel: cam.level, elapsed: 0, ms: instant ? 0 : TWEEN_MS };
  }, [scene, cam, instant, camera, view]);

  useFrame(({ camera: cam3d }, delta) => {
    const tw = tween.current;
    if (!tw) return;
    // A hidden tab hands back one huge delta on return. Clamping it keeps the pose finite and the
    // move continues from where it paused (T-6.3-12).
    tw.elapsed += Math.min(delta, 0.1) * 1000;
    const t = tw.ms > 0 ? Math.min(1, tw.elapsed / tw.ms) : 1;
    const pose = tweenPose(tw.from, tw.to, t);

    cam3d.position.set(...pose.position);
    cam3d.lookAt(...pose.lookAt);
    if (cam3d.fov !== pose.fov) {
      cam3d.fov = pose.fov;
      cam3d.updateProjectionMatrix();
    }
    view.set({ lookAt: pose.lookAt, level: effectiveLevel(tw.fromLevel, tw.toLevel, t), moving: t < 1 });
  });

  return null;
}
