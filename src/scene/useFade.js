import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { shellOpacity } from "./poses.js";

/**
 * Drives one shell's opacity from the camera's continuous level every frame, without re-rendering
 * React. `view` is the rig's view store: its level is 3.4 part way into a cabinet, so a fade
 * interrupted half way carries on from where it was (T-6.4-11).
 */
export function useFade(view, fadeAt, { min = 0 } = {}) {
  const ref = useRef(null);
  useFrame(() => {
    const mesh = ref.current;
    if (!mesh?.material) return;
    const opacity = Math.max(min, shellOpacity(fadeAt, view.get().level));
    mesh.material.opacity = opacity;
    mesh.visible = opacity > 0.01;
  });
  return ref;
}

/** Edge lines keep a faint minimum, so a faded shell still shows its shape (T-6.4-7). */
export const useEdgeFade = (view, fadeAt) => useFade(view, fadeAt, { min: 0.22 });
