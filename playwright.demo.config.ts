import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/demo",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  reporter: "list",
  outputDir: "work/qa/demo-test-results",
  use: {
    baseURL: "http://127.0.0.1:4175",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command:
      "node_modules/.bin/vite preview --host 127.0.0.1 --port 4175 --strictPort",
    url: "http://127.0.0.1:4175",
    reuseExistingServer: false,
  },
});
