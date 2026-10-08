import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 240000,
  workers: 1,
  // Starts an isolated validator and the demo server unless one is already running.
  webServer: {
    command: "pnpm dev",
    url: "http://127.0.0.1:3000/api/state",
    reuseExistingServer: true,
    timeout: 180000,
    stdout: "ignore",
    stderr: "pipe"
  },
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure"
  },
  reporter: "list"
});
