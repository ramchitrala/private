import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const PORT = 3210;
const systemChromium = "/opt/pw-browsers/chromium";

// End-to-end tests run against the dev server in mock mode: no API calls are made.
export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  workers: 1,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "off",
    launchOptions: process.env.PW_CHROMIUM_PATH || !existsSync(systemChromium) ? { executablePath: process.env.PW_CHROMIUM_PATH || undefined } : {},
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { MOCK_ANTHROPIC: "1", APP_PASSCODE: "test-passcode" },
  },
});
