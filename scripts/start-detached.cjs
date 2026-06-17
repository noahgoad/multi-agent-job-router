// Spawns the Pharos API + Vite dev server as detached children so
// they survive the parent shell exiting. Used by the "khởi động
// server" workflow — the agent runs this once, exits, and the two
// servers keep listening.
//
// The API is launched through `watch-api.bat`, a watchdog loop
// that re-runs the API if it crashes. `PHAROS_ROUTER_DATA_DIR`
// turns on JSON-file persistence so the demo job survives an
// API restart.
//
// Usage:  node scripts/start-detached.cjs
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = "D:\\pharos-future-ideas\\04-multi-agent-job-router";
const DATA_DIR = path.join(ROOT, "apps", "api", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function startDetached(label, cwd, args, env) {
  const child = spawn(process.execPath, args, {
    cwd,
    detached: true,
    stdio: "ignore",
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  child.unref();
  console.log(`[${label}] pid=${child.pid} cwd=${cwd}`);
  return child.pid;
}

// 1. API on 127.0.0.1:8787 in demo mode. Run through a Node-based
//    watchdog (`watch-api.cjs`) so a crash restarts automatically.
//    PHAROS_ROUTER_DATA_DIR enables JSON-file persistence (jobs.json
//    under apps/api/data) so the demo job survives an API restart.
startDetached(
  "pharos-api-watch",
  ROOT,
  [path.join(ROOT, "scripts", "watch-api.cjs")],
  {
    PHAROS_ROUTER_DEMO: "1",
    PHAROS_ROUTER_DATA_DIR: DATA_DIR,
    // Dashboard may run on 5173 (default) or 5180 (when 5173 is
    // taken by a sibling project's Vite).
    CORS_ORIGINS:
      "http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:5180,http://localhost:5180",
  }
);

// 2. Vite dev server on 127.0.0.1:5180 (5173 is taken by a sibling
//    project's Vite, so we pin a different port).
startDetached(
  "pharos-vite",
  path.join(ROOT, "apps", "web"),
  [
    path.join(ROOT, "node_modules", "vite", "bin", "vite.js"),
    "--port",
    "5180",
    "--strictPort",
    "--host",
    "127.0.0.1",
  ],
  {}
);
