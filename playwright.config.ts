import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: "list",
  outputDir: "work/qa/playwright-results",
  use: {
    baseURL: "http://127.0.0.1:4174",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `PORT=4174 DATA_DIR=work/qa/e2e-${Date.now()} node_modules/.bin/tsx server/index.ts`,
    url: "http://127.0.0.1:4174/api/health",
    reuseExistingServer: false,
    timeout: 20000,
  },
});
