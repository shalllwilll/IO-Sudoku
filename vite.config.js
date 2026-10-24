import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the browser talks to the Vite server, which forwards /api to the
// FastAPI backend. Same origin means no CORS setup is needed while developing.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.VITE_API_PROXY_TARGET || "http://localhost:8000",
    },
  },
});
