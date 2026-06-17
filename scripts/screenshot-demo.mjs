// Captures a PNG screenshot of the running dashboard at the
// current time. Uses the system-installed Microsoft Edge as the
// browser engine (no need to download Playwright's chromium).
//
// Usage:
//   node scripts/screenshot-demo.mjs                    # dashboard root
//   node scripts/screenshot-demo.mjs "http://..."       # any URL
//   node scripts/screenshot-demo.mjs "" 1920 1080      # custom viewport
// Output: docs/dashboard-screenshot.png

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const URL_TARGET = process.argv[2] || "http://127.0.0.1:5173/";
const WIDTH = Number(process.argv[3] ?? 1280);
const HEIGHT = Number(process.argv[4] ?? 900);
const OUT = resolve(projectRoot, "docs/dashboard-screenshot.png");

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "/usr/bin/microsoft-edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const browser = await chromium.launch({
  headless: true,
  executablePath: EDGE_PATHS.find((p) => {
    try {
      // best-effort existence check; playwright will fail with a
      // clear error if the path is wrong
      const fs = require("node:fs");
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }),
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-web-security",
    "--allow-running-insecure-content",
  ],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
});
const page = await context.newPage();
console.log("navigating to", URL_TARGET);
await page.goto(URL_TARGET, { waitUntil: "networkidle", timeout: 30_000 });
// Wait for the dashboard to render the state list (or 5s, whichever
// comes first).
await page
  .waitForSelector("h1, .pharos-loading, .pharos-error, .pharos-empty", {
    timeout: 10_000,
  })
  .catch(() => {});
await page.waitForTimeout(1500);
const buf = await page.screenshot({ fullPage: true });
writeFileSync(OUT, buf);
console.log("wrote", OUT, `(width=${WIDTH}, height=${HEIGHT})`);
await browser.close();
