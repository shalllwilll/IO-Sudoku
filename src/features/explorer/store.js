// Local workbook contents live in memory only; nothing is persisted or uploaded.
let current = null;
export const explorerStore = {
  get: () => current,
  set: (dataset) => { current = dataset; },
  clear: () => { current = null; },
};
