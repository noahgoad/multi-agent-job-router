import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the Pharos Multi-Agent Job Router dashboard.
 * The dashboard is served by Vite on port 5173; the API is started
 * by the global-setup script.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "off",
  },
  projects: [
    { name: "chromium-desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "chromium-mobile", use: { ...devices["Pixel 5"] } },
  ],
  webServer: [
    {
      command: "node ../api/test-server.mjs",
      port: 8787,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: "npx vite --port 5173",
      port: 5173,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
  ],
});