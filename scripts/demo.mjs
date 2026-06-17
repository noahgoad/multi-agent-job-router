#!/usr/bin/env node
// Local end-to-end demo runner.
//
// 1. Builds the API and the dashboard (if not built already).
// 2. Refuses to start if $API_PORT or $WEB_PORT is already in use.
// 3. Starts the API server in the background on $API_PORT
//    (default 8787) with `PHAROS_ROUTER_DEMO=1` so the in-process
//    registry is pre-seeded with a trusted agent + skill release.
// 4. Waits for the API to respond on /healthz.
// 5. Seeds the demo job via `scripts/seed-demo.mjs`.
// 6. Starts the Vite dev server in `apps/web` on $WEB_PORT
//    (default 5173).
// 7. Waits for the dashboard to respond on /.
// 8. Forwards Ctrl-C to the children and waits for clean exit.
//
// Usage:
//   node scripts/demo.mjs           # foreground, Ctrl-C to stop
//   API_PORT=9000 WEB_PORT=5174     # override ports

import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const API_PORT = Number(process.env.API_PORT ?? 8787);
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

function log(label, msg) {
  process.stdout.write(`[${label}] ${msg}\n`);
}

function portInUse(port) {
  const out = spawnSync("netstat", ["-ano"], { encoding: "utf8" });
  if (out.status !== 0) return false;
  return out.stdout
    .split(/\r?\n/)
    .some((line) => /LISTENING/.test(line) && line.includes(`:${port} `));
}

async function waitFor(url, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(url);
      if (r.status < 500) {
        log(label, `ready at ${url} (status=${r.status})`);
        return true;
      }
    } catch {
      /* not ready yet */
    }
    await delay(250);
  }
  throw new Error(
    `${label} did not become ready within ${timeoutMs}ms (url=${url})`
  );
}

const children = [];

function startProcess(label, cmd, args, cwd, env) {
  const child = spawn(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (b) => process.stdout.write(`[${label}] ${b}`));
  child.stderr.on("data", (b) => process.stderr.write(`[${label}!] ${b}`));
  child.on("exit", (code) => log(label, `exited with code ${code}`));
  children.push({ label, child });
  return child;
}

async function shutdown(code = 0) {
  for (const { label, child } of children) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/pid", String(child.pid), "/f", "/t"], {
          stdio: "ignore",
        });
      } else {
        child.kill("SIGTERM");
      }
      log("demo", `stopped ${label}`);
    } catch (err) {
      log("demo", `failed to stop ${label}: ${err.message}`);
    }
  }
  process.exit(code);
}

process.on("SIGINT", () => void shutdown(130));
process.on("SIGTERM", () => void shutdown(143));

const projectRoot = new URL("..", import.meta.url).pathname.replace(
  /^\/(?=[A-Za-z]:)/,
  ""
);

async function ensureBuild() {
  log("demo", "building workspaces (tsc -b)...");
  const out = spawnSync("node", ["node_modules/typescript/bin/tsc", "-b"], {
    cwd: projectRoot,
    stdio: "inherit",
  });
  if (out.status !== 0) throw new Error("tsc -b failed");
}

async function main() {
  await ensureBuild();
  if (portInUse(API_PORT)) {
    throw new Error(
      `port ${API_PORT} is already in use; set API_PORT to a free port (or stop the conflicting process)`
    );
  }
  if (portInUse(WEB_PORT)) {
    throw new Error(
      `port ${WEB_PORT} is already in use; set WEB_PORT to a free port (or stop the conflicting process)`
    );
  }
  startProcess("api", "node", ["apps/api/dist/src/main.js"], projectRoot, {
    API_HOST: "127.0.0.1",
    API_PORT: String(API_PORT),
    PHAROS_ROUTER_DEMO: "1",
    // Make the CORS allow-list track the dashboard port the operator
    // picked (defaults to 5173 like Vite does, but `WEB_PORT` may
    // override that if 5173 is in use by a sibling project).
    CORS_ORIGINS: [
      `http://127.0.0.1:${WEB_PORT}`,
      `http://localhost:${WEB_PORT}`,
    ].join(","),
  });
  await waitFor(`${API_URL}/healthz`, "api", 30_000);
  log("demo", "seeding demo job...");
  const seed = spawnSync("node", ["scripts/seed-demo.mjs"], {
    cwd: projectRoot,
    stdio: "inherit",
    env: { ...process.env, API_URL, API_TOKEN: "dev-token" },
  });
  if (seed.status !== 0) {
    log("demo", "seeding failed");
    await shutdown(1);
    return;
  }
  const viteBin = `${projectRoot}node_modules/vite/bin/vite.js`;
  startProcess(
    "web",
    "node",
    [
      viteBin,
      "--port",
      String(WEB_PORT),
      "--host",
      "127.0.0.1",
      "--strictPort",
    ],
    `${projectRoot}apps/web`,
    { VITE_API_URL: API_URL }
  );
  await waitFor(WEB_URL, "web", 30_000);
  log("demo", "");
  log("demo", `Open the dashboard: ${WEB_URL}/`);
  log("demo", "(default props render jobId=demo with authToken=dev-token)");
  log("demo", "Press Ctrl-C to stop both servers.");
  // Keep the parent alive until a child dies or the user signals.
  await new Promise((resolve) => {
    const api = children.find(({ label }) => label === "api")?.child;
    if (api) {
      api.on("exit", () => resolve());
    } else {
      resolve();
    }
  });
  await shutdown(0);
}

main().catch(async (err) => {
  log("demo", `error: ${err.message}`);
  await shutdown(1);
});
