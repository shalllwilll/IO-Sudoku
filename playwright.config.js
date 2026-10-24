import { defineConfig, devices } from "@playwright/test";

const port = 4173;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 720 } } }],
  webServer: {
    command: `npm run build && npx vite preview --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
