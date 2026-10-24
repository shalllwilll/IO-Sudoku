import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["src/test/setup.js"],
    include: ["src/**/*.test.{js,jsx}", "scripts/**/*.test.{js,mjs}"],
    css: false,
  },
});
