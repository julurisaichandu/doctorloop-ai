import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e", // tests/test-run belongs to playwright.test-run.config.ts
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: ".verification/test-results",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run start -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DOCTORLOOP_LOCAL_DB_PATH: ".data/e2e-db.json",
      // Pin integrations so a developer's .env.local can never leak into the suite.
      VEXO_MODE: "mock",
      OPENAI_API_KEY: "",
      ELEVENLABS_API_KEY: "",
      ELEVENLABS_AGENT_ID: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      SUPABASE_SECRET_KEY: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      ENABLE_DEMO_ROLE_SWITCHER: "true",
      // Test-only secret: production mode refuses to start sessions without one.
      SESSION_SECRET: "e2e-only-session-secret-not-for-real-use-0123456789",
    },
  },
});
