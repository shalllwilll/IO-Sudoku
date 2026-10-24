/**
 * Where the camera is between levels, as a continuous number: 3.4 means "two fifths of the way
 * from the closed cabinet into its interior". The rig writes it every frame and the shell fades
 * read it, so it deliberately lives outside React state: nothing re-renders when it changes.
 */
export function createView(level = 1) {
  let state = { level, lookAt: [0, 2.5, 0], moving: false };
  return {
    get: () => state,
    set: (patch) => {
      state = { ...state, ...patch };
    },
  };
}
