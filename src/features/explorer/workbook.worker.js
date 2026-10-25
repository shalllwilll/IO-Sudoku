import { readWorkbook } from "./workbook.js";

self.onmessage = async ({ data }) => {
  try { self.postMessage({ workbook: await readWorkbook(data.buffer, data.name) }); }
  catch (error) { self.postMessage({ error: error.message }); }
};
