import { BoxGeometry, EdgesGeometry } from "three";

// Edge geometry is shared per box size: a cabinet's outline is the same geometry whichever cabinet
// draws it, so mounting the scene allocates a handful of buffers rather than one per mesh.
const cache = new Map();

export function boxEdges(w, h, d) {
  const key = `${w}:${h}:${d}`;
  if (!cache.has(key)) {
    const box = new BoxGeometry(w, h, d);
    cache.set(key, new EdgesGeometry(box));
    box.dispose();
  }
  return cache.get(key);
}

/** Called when the stage unmounts, so leaving the page frees the GPU buffers it made. */
export function disposeShared() {
  for (const geometry of cache.values()) geometry.dispose();
  cache.clear();
}
