// The one `api` object every screen uses. Mode comes from VITE_API_MODE (mock by default).
import { config } from "../config.js";
import { liveApi } from "./live/index.js";
import { mockApi } from "./mock/index.js";

export const api = config.mode === "live" ? liveApi : mockApi;
