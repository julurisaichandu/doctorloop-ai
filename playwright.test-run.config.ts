import { defineConfig, devices } from "@playwright/test";

// Whole-app rehearsal. Driven by `npm run test:run` (scripts/test-run.mjs), which builds into
// .next-testrun and sets the environment that this config and the server inherit.
const port = process.env.TEST_RUN_PORT ?? "3200";
const headed = process.env.TEST_RUN_HEADED === "1";
const nextBin = "node_modules/next/dist/bin/next";

export default defineConfig({
  testDir: "tests/test-run",
  workers: 1,
  fullyParallel: false,
  timeout: 300_000,
  expect: { timeout: 30_000 },
  reporter: [["list"], ["html", { outputFolder: ".verification/test-run-report", open: "never" }]],
  outputDir: ".verification/test-run-results",
  use: {
    baseURL: `http://localhost:${port}`,
    video: "on",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    headless: !headed,
    launchOptions: headed ? { slowMo: 300 } : {},
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `"${process.execPath}" ${nextBin} start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
