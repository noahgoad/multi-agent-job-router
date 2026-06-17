// Verify auto-play behavior on second visit (after demo has finished).
// Should NOT trigger auto-play because the job is in terminal state.
import { chromium } from "playwright";
import { writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const URL_TARGET =
  process.argv[2] ?? "http://127.0.0.1:5180/?jobId=demo&authToken=dev-token";

const EDGE_PATHS = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const edgeExe = EDGE_PATHS.find((p) => existsSync(p));

const browser = await chromium.launch({
  headless: true,
  executablePath: edgeExe,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

let playCount = 0;
page.on("request", (req) => {
  if (req.url().endsWith("/play")) playCount += 1;
});
const consoleMsgs = [];
page.on("console", (m) => consoleMsgs.push(`[${m.type()}] ${m.text()}`));

console.log("navigating to", URL_TARGET);
await page.goto(URL_TARGET, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(4000);
console.log(`play requests during 4s wait: ${playCount}`);
console.log(`console messages: ${consoleMsgs.length}`);
await browser.close();
