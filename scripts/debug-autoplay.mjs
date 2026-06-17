// Capture console + network requests while the dashboard auto-plays.
// Used to debug why the UI doesn't reflect the API's state changes.
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

const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
page.on("request", (req) => {
  if (req.url().includes("127.0.0.1:8787")) {
    logs.push(`[req] ${req.method()} ${req.url()}`);
  }
});
page.on("response", async (res) => {
  if (res.url().includes("127.0.0.1:8787")) {
    let body = "";
    try {
      body = await res.text();
      if (body.length > 300) body = body.slice(0, 300) + "...";
    } catch {}
    logs.push(`[net ${res.status()}] ${res.url()} :: ${body}`);
  }
});
page.on("requestfailed", (req) => {
  if (req.url().includes("127.0.0.1:8787")) {
    logs.push(`[reqfail] ${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
  }
});

console.log("navigating to", URL_TARGET);
await page.goto(URL_TARGET, { waitUntil: "networkidle", timeout: 30_000 });
await page.waitForTimeout(8000);
writeFileSync(resolve(projectRoot, "docs/browser-debug.log"), logs.join("\n"));
console.log(`captured ${logs.length} log lines → docs/browser-debug.log`);
await browser.close();
