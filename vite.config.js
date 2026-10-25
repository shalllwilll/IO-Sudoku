import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// In development the browser talks to the Vite server, which forwards /api to the
// FastAPI backend. Same origin means no CORS setup is needed while developing.
function allowedConnectSources(apiBase) {
  const sources = ["'self'", "ws://localhost:*", "ws://127.0.0.1:*"];
  if (apiBase) {
    try {
      const apiUrl = new URL(apiBase);
      if (apiUrl.protocol === "http:" || apiUrl.protocol === "https:") sources.push(apiUrl.origin);
    } catch {
      // An invalid API base is handled by the live adapter; do not broaden the CSP for it.
    }
  }
  return [...new Set(sources)].join(" ");
}

// Development uses the same-origin proxy. A live build adds only its configured API origin;
// local websocket sources are limited to Vite HMR.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  const connectSources = allowedConnectSources(env.VITE_API_BASE_URL);

  return {
    worker: { format: "es" },
    plugins: [
      react(),
      {
        name: "app-content-security-policy",
        transformIndexHtml(html) {
          return html.replace("__CSP_CONNECT_SOURCES__", connectSources);
        },
      },
    ],
    server: {
      proxy: {
        "/api": process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
      },
    },
  };
});
