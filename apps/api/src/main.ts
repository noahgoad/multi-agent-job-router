// API server entry point.
//
// `server.ts` exports `buildServer` and `startServer` so it can be
// consumed by the vitest suite. The CLI entry that actually binds
// the socket and starts serving traffic lives in this file. Run
// with `node apps/api/dist/src/main.js` (built) or
// `tsx apps/api/src/main.ts` (development).
//
// When the `PHAROS_ROUTER_DEMO=1` environment variable is set, the
// server pre-seeds the in-process `AgentSkillRegistry` with a
// single trusted skill release + agent + heartbeat so the
// dashboard demo (`scripts/seed-demo.mjs`) has something to route
// against. Without `PHAROS_ROUTER_DEMO=1`, the registry starts
// empty and every job is rejected at the routing step.

import { join as pathJoin } from "node:path";
import {
  contentHash,
  hashString,
  ArtifactStore,
  type Hash,
} from "@pharos-router/workflow";
import { AgentSkillRegistry } from "@pharos-router/registry";
import { startServer } from "./server.js";
import { JobStore } from "./app.js";
import { FileStorage } from "./storage.js";

const host = process.env.API_HOST ?? "127.0.0.1";
const port = Number(process.env.API_PORT ?? 8787);

// Optional CORS override. The defaults baked into server.ts cover
// the standard Vite dev port (5173). Operators running the dashboard
// on a different port (because the default is in use, e.g. by a
// sibling project) can set `CORS_ORIGINS` to a comma-separated list
// and we splice it in here so the server still applies a tight
// allow-list rather than reflecting the request origin.
// eslint-disable-next-line no-console
console.log(
  `[boot] PHAROS_ROUTER_DEMO=${process.env.PHAROS_ROUTER_DEMO ?? "(unset)"} ` +
    `PHAROS_ROUTER_DATA_DIR=${process.env.PHAROS_ROUTER_DATA_DIR ?? "(unset)"}`
);
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",")
      .map((o) => o.trim())
      .filter((o) => o.length > 0)
  : undefined;

function buildDemoRegistry() {
  const registry = new AgentSkillRegistry();
  const skill: {
    skillId: string;
    version: string;
    releaseHash: Hash;
    imageDigest: string;
    publishedAt: number;
    expiresAt: number;
    capabilities: string[];
    certikVerdict: "pass" | "fail" | "expired";
    certikVerdictAt: number;
    certikReportUrl: string;
  } = {
    skillId: "summarize",
    version: "1.0.0",
    releaseHash: ("0x" + "00".repeat(32)) as Hash,
    imageDigest: "sha256:demo",
    publishedAt: 0,
    expiresAt: 9_999_999_999,
    capabilities: [
      "fetch",
      "analyze",
      "summarize",
      "verify",
      "financial",
      "write",
      "read",
      "compute",
    ],
    certikVerdict: "pass",
    certikVerdictAt: 0,
    certikReportUrl: "https://certik.example/demo",
  };
  const { releaseHash: _omit, ...body } = skill;
  skill.releaseHash = contentHash(body);
  registry.registerSkill(skill);

  const agentId = "agent-demo";
  const endpoint = "https://demo-agent.example";
  // Initial register + first heartbeat. Both have to land — the
  // routing layer won't consider the agent until the heartbeat is
  // recorded, and `isEligible` requires it to be <300s old.
  const t0 = Math.floor(Date.now() / 1000);
  registry.registerAgent({
    agentId,
    displayName: "Demo Agent",
    endpoint,
    pricingMicrousd: 1_000n,
    trustScore: 90,
    capabilities: [
      "fetch",
      "analyze",
      "summarize",
      "verify",
      "financial",
      "write",
      "read",
      "compute",
    ],
    activeSkillRelease: skill.releaseHash,
    lastHeartbeat: t0,
    registeredAt: t0,
  });
  registry.recordHeartbeat({
    agentId,
    endpoint,
    issuedAt: t0,
    nonce: "demoNonce",
    signature: hashString("demo-sig"),
  });
  // Refresh the heartbeat every 60s so a long-lived dev server
  // doesn't see the demo agent fall out of the 300s freshness window.
  // `registerAgent` is non-idempotent (it throws on duplicate), so
  // the periodic refresh only needs to call `recordHeartbeat` — the
  // agent record itself doesn't change. The previous implementation
  // called both inside the same try/catch, so every 60s the
  // heartbeat refresh was silently swallowed by the "already
  // registered" error and the demo agent's heartbeat went stale
  // after 5 minutes, breaking routing and causing every job to
  // fail with "t1 FAILED, downstream CANCELLED".
  // `unref()` so the interval never blocks process shutdown.
  const timer = setInterval(() => {
    try {
      const t = Math.floor(Date.now() / 1000);
      registry.recordHeartbeat({
        agentId,
        endpoint,
        issuedAt: t,
        nonce: "demoNonce",
        signature: hashString("demo-sig"),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[demo-heartbeat] refresh failed:", err);
    }
  }, 60_000);
  timer.unref();
  return registry;
}

// Wire a file-backed JobStore when PHAROS_ROUTER_DATA_DIR is set so a
// job survives an API restart. `server.ts` only attaches a FileStorage
// when the caller hasn't already supplied a store, so this has to be
// done here (not in server.ts) for the demo entrypoint, which always
// passes its own store.
const dataDir = process.env.PHAROS_ROUTER_DATA_DIR;
const fileStorage = dataDir
  ? new FileStorage(pathJoin(dataDir, "jobs.json"))
  : null;

const deps =
  process.env.PHAROS_ROUTER_DEMO === "1"
    ? {
        store: new JobStore({ storage: fileStorage }),
        registry: buildDemoRegistry(),
        artifact: new ArtifactStore(),
        humanApprove: async () => true,
        now: () => Math.floor(Date.now() / 1000),
      }
    : undefined;

/**
 * FNV-1a 32-bit hash, zero-padded to 32 bytes (66 chars including
 * `0x` prefix). Mirrors the helper in `scripts/seed-demo.mjs` so the
 * auto-seeded job is byte-identical to one created via the script.
 */
function demoHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return ("0x" + hex).padEnd(66, "0");
}

/**
 * Demo JobSpec used when `PHAROS_ROUTER_AUTO_SEED=1`. The same 4-task
 * diamond DAG that `scripts/seed-demo.mjs` POSTs, so the dashboard
 * shows the exact same job whether the user starts the API locally
 * with the seed script or pulls the public Render deployment.
 */
function buildDemoSpec() {
  return {
    jobId: "demo",
    goal: "Demo: route a 4-task diamond DAG, verify it, and inspect the receipt",
    goalHash: demoHash("goal:demo"),
    budgetMicrousd: 1_000_000n,
    deadline: 9_999_999_999,
    allowedCapabilities: [
      "fetch",
      "analyze",
      "summarize",
      "verify",
      "financial",
    ],
    policyHash: demoHash("policy:demo"),
    verifier: "verifier-default",
    tasks: [
      {
        taskId: "t1",
        description: "Fetch the source document",
        dependencies: [],
        capability: "fetch",
        inputHash: demoHash("t1:demo"),
        budgetMicrousd: 100_000n,
        deadline: 9_000_000_000,
        verifier: "verifier-default",
        verifierKind: "hash",
      },
      {
        taskId: "t2",
        description: "Analyze the fetched content",
        dependencies: ["t1"],
        capability: "analyze",
        inputHash: demoHash("t2:demo"),
        budgetMicrousd: 200_000n,
        deadline: 9_400_000_000,
        verifier: "verifier-default",
        verifierKind: "deterministic",
      },
      {
        taskId: "t3",
        description: "Validate the analysis",
        dependencies: ["t1"],
        capability: "verify",
        inputHash: demoHash("t3:demo"),
        budgetMicrousd: 200_000n,
        deadline: 9_600_000_000,
        verifier: "verifier-default",
        verifierKind: "schema",
      },
      {
        taskId: "t4",
        description: "Finalize the report",
        dependencies: ["t2", "t3"],
        capability: "summarize",
        inputHash: demoHash("t4:demo"),
        budgetMicrousd: 300_000n,
        deadline: 9_900_000_000,
        verifier: "verifier-default",
        verifierKind: "schema",
      },
    ],
  };
}

/**
 * On boot, if demo mode is on AND the in-memory store is empty,
 * create + approve the demo job so the dashboard has something to
 * render on first load. The job is left in `PLANNED` — the dashboard
 * drives the slow-motion execute itself via `POST /jobs/:id/play`.
 *
 * Why this exists:
 *   Render's free tier does not support persistent disks (we tried;
 *   see `render.yaml`). The dashboard would otherwise land on an
 *   empty store and have nothing to show. With auto-seed, every cold
 *   start leaves the store in the same `demo PLANNED` state, so the
 *   demo URL is consistent regardless of how many times the service
 *   has slept and woken up.
 */
function autoSeedDemoIfEmpty() {
  if (process.env.PHAROS_ROUTER_DEMO !== "1") return;
  if (process.env.PHAROS_ROUTER_AUTO_SEED !== "1") return;
  if (!deps) return;

  const store = deps.store;
  if (store.list().length > 0) {
    // eslint-disable-next-line no-console
    console.log("[auto-seed] store already populated; skipping");
    return;
  }

  const spec = buildDemoSpec();
  try {
    const now = Math.floor(Date.now() / 1000);
    const job = store.create(spec as never, now);
    job.approval = { approver: "auto-seed", approvedAt: now };
    store.save();
    // eslint-disable-next-line no-console
    console.log(`[auto-seed] created + approved demo job "${spec.jobId}" (PLANNED)`);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[auto-seed] failed to seed demo job:", err);
  }
}

startServer({
  host,
  port,
  deps,
  ...(corsOrigins ? { security: { corsOrigins } } : {}),
})
  .then(({ url }) => {
    // Run the auto-seed after the server is up so the first
    // dashboard request finds the demo job ready.
    autoSeedDemoIfEmpty();
    // eslint-disable-next-line no-console
    console.log(`pharos-router API listening on ${url}`);
    if (process.env.PHAROS_ROUTER_DEMO === "1") {
      // eslint-disable-next-line no-console
      console.log("demo mode: registry pre-seeded with agent-demo + skill");
    }
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error("failed to start API server:", err);
    process.exit(1);
  });
