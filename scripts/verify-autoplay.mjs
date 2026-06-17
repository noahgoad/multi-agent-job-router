// Capture multiple screenshots of the dashboard as the auto-play
// runs. Used to verify the first-load auto-play actually fires and
// the user sees the DAG transition through states.
import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const OUT_DIR = resolve(projectRoot, "docs");

const URL_TARGET =
  process.argv[2] ?? "http://127.0.0.1:5180/?jobId=demo&authToken=dev-token";
const WIDTH = Number(process.argv[3] ?? 1280);
const HEIGHT = Number(process.argv[4] ?? 800);
// Capture at these wall-clock offsets (ms after navigation completes).
const OFFSETS = [500, 1500, 4000, 8000];

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

const browser = await chromium.launch({
  headless: true,
  executablePath: EDGE_PATHS.find((p) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require("node:fs").existsSync(p);
    } catch {
      return false;
    }
  }),
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
});
const page = await context.newPage();
console.log("navigating to", URL_TARGET);
await page.goto(URL_TARGET, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForSelector("h1, .pharos-loading", { timeout: 10_000 });
const navStart = Date.now();
for (const ms of OFFSETS) {
  const remaining = ms - (Date.now() - navStart);
  if (remaining > 0) await page.waitForTimeout(remaining);
  const fname = resolve(OUT_DIR, `dashboard-frame-${ms}ms.png`);
  const buf = await page.screenshot({ fullPage: true });
  writeFileSync(fname, buf);
  console.log("captured", fname);
}
await browser.close();
