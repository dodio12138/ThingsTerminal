import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const port = 3211;
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const runId = `${process.pid}-${Date.now()}`;

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  fullyParallel: false,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    launchOptions: fs.existsSync(chromePath) ? { executablePath: chromePath } : {}
  },
  webServer: {
    command: `env NODE_ENV=test PORT=${port} ADMIN_PASSWORD=browser-test-password DB_PATH=/private/tmp/things-terminal-browser-${runId}.sqlite UPLOAD_DIR=/private/tmp/things-terminal-browser-uploads-${runId} node server.js`,
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 30_000
  },
  outputDir: "output/playwright/results"
});
