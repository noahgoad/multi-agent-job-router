---
name: pharos-multi-agent-job-router
description: Use when working on the Pharos Multi-Agent Job Router — a TypeScript npm-workspaces monorepo that decomposes a JobSpec into a DAG, selects qualified agents, verifies results with a diversity filter, and anchors receipts on Pharos Atlantic (chainId 688689). Covers local dev (API on :8787, web on :5173), the 8-tool stdio MCP server, the Fastify HTTP API surface, split-host deployment (API on Railway via railway.toml, web on Vercel via vercel.json), the 11-package layered architecture, the vitest + hardhat test suites (84/84), and the four stability features (FileStorage, watchdog, frontend retry, auto-seed). Load when the user asks how to run, deploy, test, debug, integrate with, or extend the router.
---

# Pharos Multi-Agent Job Router

Coordination layer for routing approved jobs to a network of independent AI
agents. Verifies intermediate results and anchors the final receipt on the
**Pharos Atlantic** testnet (chainId `688689`).

When this skill is loaded, treat the repo as a layered monorepo. Change the
narrowest layer that owns the behaviour you need — do not edit cross-cutting
concerns from the wrong package.

## Layered package map

| Layer | Path | Package | What lives here |
|---|---|---|---|
| Edge (HTTP) | `apps/api` | `@pharos-router/api` | Fastify server, CORS, bearer auth, rate limit, body limits, bigint-safe JSON, `/jobs/*` routes |
| Edge (Web) | `apps/web` | `@pharos-router/web` | React + Vite dashboard, polling with exponential backoff, `runAuto("happy")`, `ApiDownToast` |
| Edge (Tool) | `apps/mcp` | `@pharos-router/mcp` | stdio MCP server with 8 tools, financial-confirm gate |
| Core (plan) | `packages/workflow` | `@pharos-router/workflow` | `jobSpecSchema` (Zod), `compileJobSpec` → `JobGraph`, keccak256 content hashes, cycle/deadline/budget validation, off-chain artifact store, optional Qwen proposer |
| Core (trust) | `packages/registry` | `@pharos-router/registry` | Agent & skill records, CertiK verdict bridge, heartbeat freshness (≤300s), trust-score gate |
| Core (route) | `packages/routing` | `@pharos-router/routing` | Weighted selection (capability · trust · cost · latency · availability) + diversity filter + explain |
| Core (policy) | `packages/policy` | `@pharos-router/policy` | Least-privilege, budget accounting, retry bounds, HITL gate, `assertNoHiddenDelegation` |
| Service (run) | `services/orchestrator` | `@pharos-router/orchestrator` | Per-task runner, downstream cancellation, GoPlus + CertiK bridges |
| Service (verify) | `services/verifier` | `@pharos-router/verifier` | 5 verifier types (schema · hash · det · tx · human) + aggregator |
| Chain | `packages/contracts` | `@pharos-router/contracts` | `JobRouterRegistry` (Ownable, Solidity 0.8 + OZ v5), viem-based Atlantic client, deploy script, hardhat tests |
| Client | `packages/sdk` | `@pharos-router/sdk` | Typed Fastify client for the HTTP API |

**Edit discipline:**
- HTTP shape, auth, CORS → `apps/api`
- DAG compilation, hashing, validation → `packages/workflow`
- Agent eligibility, CertiK, heartbeat → `packages/registry`
- Selection weights, diversity → `packages/routing`
- Budget, retry, HITL, hidden-delegation → `packages/policy`
- Per-task execution semantics → `services/orchestrator`
- Verifier set or verdict aggregation → `services/verifier`
- On-chain registry → `packages/contracts`
- Dashboard UI, polling, auto-play → `apps/web`
- New MCP tool → `apps/mcp`

## Quick start (local dev)

```bash
# Node ≥ 20 required (developed on v24.16.0).
cp .env.example .env       # no real secrets needed for the demo
npm install
npm run build

# Terminal 1 — API under the watchdog (auto-restart on crash, 3s)
node scripts/watch-api.cjs

# Terminal 2 — Vite dev server (port 5173 by default, env WEB_PORT)
cd apps/web && npm run dev

# Terminal 3 — seed demo + play happy-path scenario
node scripts/seed-demo.mjs
```

Open: <http://127.0.0.1:5173/?jobId=demo&authToken=dev-token>

Production override: set `PHAROS_ROUTER_AUTH_TOKEN` in `.env` — `dev-token` is
only for local development.

## Run the test suite

```bash
npm test                 # vitest — 73 tests
npm run test:contracts   # hardhat + mocha — 10 tests (Atlantic + Registry + invariants)
npm run verify           # full gate: tsc -b + vitest + hardhat + isolation + secret-scan
```

Always run `npm run verify` before opening a PR.

## HTTP API surface

All `/jobs/*` routes require `Authorization: Bearer <PHAROS_ROUTER_AUTH_TOKEN>`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness — `{ ok: true, time: <epoch> }` |
| GET | `/jobs` | List all jobs (newest first) |
| POST | `/jobs` | Create a job from a `JobSpec` |
| GET | `/jobs/:id` | Inspect a job — full state + DAG |
| POST | `/jobs/:id/approve` | Record an approval `{ approver: string }` |
| POST | `/jobs/:id/route` | Dry-run routing for all ready tasks |
| POST | `/jobs/:id/execute` | Run all ready tasks in dependency order |
| POST | `/jobs/:id/verify` | Re-run verifier set on existing results |
| POST | `/jobs/:id/cancel` | Cancel a job and propagate to descendants |
| POST | `/jobs/:id/retry` | Retry a single failed task `{ taskId }` |
| POST | `/jobs/:id/reset` | Reset a terminal job back to PLANNED |
| POST | `/jobs/:id/play` | Slow-motion execute for the dashboard |

**`POST /jobs/:id/play`** body:

```json
{ "tickMs": 1500, "approver": "demo", "scenario": "happy" }
```

- `tickMs` — pacing between task transitions (default `1500`)
- `approver` — string used to satisfy the HITL gate
- `scenario` — `happy` · `verifier` · `failure` (default `happy`)

Errors always return `{ error, code, message }` — never stack traces or secrets.

## MCP server (8 tools)

Start with `node apps/mcp/dist/src/server.js` (stdio). Tool names all share the
`pharos_router_` prefix:

| Tool | Read/Write | Notes |
|---|---|---|
| `pharos_router_create` | write | Create a job from a JobSpec |
| `pharos_router_approve` | write | Approve a job (jobId + approver) |
| `pharos_router_route` | write | Dry-run routing |
| `pharos_router_execute` | **financial** | Requires `args.confirm === true` |
| `pharos_router_verify` | write | Re-run verifier set |
| `pharos_router_cancel` | write | Cancel a job (jobId + reason) |
| `pharos_router_retry` | write | Retry a task (jobId + taskId) |
| `pharos_router_inspect` | read | Inspect a job (jobId) |

Financial tools (`execute`) are gated by `args.confirm === true` — without it
the server returns an error before any state change.

## Task state machine

```
[*] → PLANNED → ASSIGNED → RUNNING → VERIFIED → [*]
                              ↓
                          FAILED → CANCELLED → [*]
                              ↓
                          CANCELLED → [*]   (parent cancelled)
```

Per-task transitions are written to the receipt chain — every retry/assignment
is recorded, not just the terminal state.

## Configuration (.env)

| Variable | Default | Purpose |
|---|---|---|
| `PHAROS_RPC_URL` | `https://atlantic.dplabs-internal.com` | Atlantic RPC endpoint |
| `PHAROS_CHAIN_ID` | `688689` | Pharos Atlantic |
| `PHAROS_EXPLORER_URL` | `https://atlantic.pharosscan.xyz` | block explorer |
| `PHAROS_REGISTRY_ADDRESS` | *(empty)* | deployed `JobRouterRegistry` |
| `ROUTER_DEPLOYER_PRIVATE_KEY` | *(empty)* | deploy/anchor key — **set via Render dashboard, never commit** |
| `QWEN_API_KEY` / `QWEN_MODEL` | *(empty)* / `qwen-max` | optional Alibaba Qwen task-decomposition proposer |
| `GOPLUS_API_KEY` | *(empty)* | transaction-target denylist |
| `CERTIK_API_KEY` | *(empty)* | skill release approval |
| `DATABASE_URL` | `postgres://...` | reserved for future Postgres |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `8787` | API bind |
| `WEB_PORT` | `5173` | Vite dev port |
| `MIN_AGENT_TRUST_SCORE` | `60` | routing floor |
| `MAX_TASK_BUDGET_MICROUSD` | `1000000000` | per-job ceiling |
| `MIN_VERIFIER_DIVERSITY` | `2` | independent verifiers per task |
| `PHAROS_ROUTER_DATA_DIR` | *(unset)* | if set, `FileStorage` persists `jobs.json` here |
| `PHAROS_ROUTER_AUTH_TOKEN` | `dev-token` | **must override in production** |
| `PHAROS_ROUTER_AUTO_SEED` | *(unset)* | `1` re-creates the demo job on boot if the store is empty (Render free-tier workaround) |

## Deployment (split: API on Railway, web on Vercel)

The project is split across two hosts for performance:

- **API** (long-running orchestrator) → **Railway** Web Service, configured via `railway.toml`
- **Web dashboard** (static SPA) → **Vercel**, configured via `vercel.json` and served from `apps/web/dist`

Railway keeps the API always-on (no sleep) at ~$5/mo (hobby credit). Vercel's
CDN serves the static dashboard instantly. Render is kept as a legacy
fallback (`render.yaml` is still valid but marked legacy).

**Railway (`railway.toml`):** Nixpacks builder, buildCommand
`npm ci --include=dev && npm run build`, startCommand
`node apps/api/dist/src/main.js`. Health check at `/healthz`. All env vars
set in the Railway dashboard (never commit secrets). The deployer private
key (`ROUTER_DEPLOYER_PRIVATE_KEY`) and bearer token
(`PHAROS_ROUTER_AUTH_TOKEN`) live there.

**Vercel (`vercel.json`):** builds the monorepo then the Vite SPA
(`npm run build && cd apps/web && npx vite build`), publishes
`apps/web/dist`. Requires the build-time env var `VITE_API_BASE` pointing
to the Railway API URL (e.g. `https://pharos-router-api-production.up.railway.app`).

**Free-tier caveats:**

- Railway's hobby plan is $5/mo in usage credit. The API uses ~256 MB
  RAM idle, well under the limit. No persistent disk on the new usage
  plan, so `JobStore` resets on cold start. The API compensates with
  `PHAROS_ROUTER_AUTO_SEED=1`.
- Vercel has no persistent disk either, but the SPA is stateless, so
  this is fine.

**Render (legacy) env quirks** — `render.yaml` is still valid as a fallback:

- `--include=dev` is **mandatory** in `buildCommand`. Render's `NODE_ENV=production`
  propagates into the build step and causes `npm ci` to skip devDependencies
  (TypeScript, Vite, Vitest, Hardhat).
- The Node version is pinned via `.nvmrc` at the repo root.
- `PHAROS_ROUTER_AUTH_TOKEN` is auto-generated by Render. The web dashboard
  reads the token from the URL: `?authToken=<token>`. Lost it? Reset in the
  Render dashboard, push a no-op commit, redeploy.
- `ROUTER_DEPLOYER_PRIVATE_KEY` cannot live in YAML (would be committed).
  Set it manually in the Render Environment tab after first deploy.
- `CORS_ORIGINS` is a comma-separated list. After the first Vercel deploy,
  add the Vercel origin (e.g. `https://pharos-router-web.vercel.app`) and
  redeploy the API.

Full walkthroughs:
[`docs/deployment/railway.md`](../deployment/railway.md) ·
[`docs/deployment/vercel.md`](../deployment/vercel.md) ·
[`docs/deployment/render.md`](../deployment/render.md) (legacy).

## Security posture

- CORS — explicit allow-list; non-allowed origins get `403 cors_origin_denied` on writes.
- Body size — 1 MiB default → `413` on overflow.
- Bearer auth — required for every `/jobs/*` route; missing/wrong → `401`.
- Rate limit — 60 writes per minute per IP by default → `429`.
- Partner data gate — CertiK verdict + trust score ≥ 60 + heartbeat ≤ 300s all required.
- No hidden delegation — `assertNoHiddenDelegation` enforced on every task.
- Endpoint pinning — heartbeats pin the agent endpoint; mismatches are rejected.
- HTML safety — dashboard never uses `dangerouslySetInnerHTML`.

Threat model: [`docs/security/threat-model.md`](../security/threat-model.md).

## Stability features

1. **File-backed persistence** — when `PHAROS_ROUTER_DATA_DIR` is set,
   `JobStore` mounts `FileStorage` (atomic write + BigInt-safe JSON). Used on
   paid Render plans; omitted on free tier.
2. **Watchdog** — `scripts/watch-api.cjs` spawns the API as a detached child,
   tees logs to `watch.log`, restarts within 3s of an unexpected exit, gives up
   after 10 consecutive crashes.
3. **Frontend retry + toast** — `DashboardLoaded` polls with exponential
   backoff (1s → 30s cap) using `setTimeout` (not `setInterval`). When the API
   is unreachable it shows `ApiDownToast` with a live countdown and resumes
   transparently when the API returns.
4. **Auto-play + auto-seed** — dashboard calls `runAuto("happy")` on first
   load when every task is `PLANNED`. Add `?autoplay=0` to the URL to step
   manually. Server side, `PHAROS_ROUTER_AUTO_SEED=1` re-creates the `demo`
   job on boot when the in-memory store is empty.

## Common operations

### Reset the demo job and replay it

```bash
curl -X POST http://127.0.0.1:8787/jobs/demo/reset \
  -H "Authorization: Bearer dev-token"
curl -X POST http://127.0.0.1:8787/jobs/demo/play \
  -H "Authorization: Bearer dev-token" \
  -H "Content-Type: application/json" \
  -d '{"tickMs": 1500, "approver": "demo", "scenario": "happy"}'
```

### Capture a dashboard screenshot

```bash
node scripts/screenshot-demo.mjs   # writes to docs/dashboard-screenshot.png
```

### Verify the monorepo after edits

```bash
npm run verify
```

This runs: `tsc -b` + vitest (73) + hardhat (10) + workspace isolation +
secret-scan. Must all pass before opening a PR.

## Acceptance scenarios

`scripts/atlantic-acceptance/` contains six end-to-end scripts (A–F):

- **A** — 3-task job, all `VERIFIED`, `totalSpent == 3000`
- **B** — bounded-retry + persistent-failure paths
- **C** — verifier disagreement + per-task recording
- **D** — compile-time `budget_overflow` + orchestrator catch
- **E** — GoPlus denylist + worker abort
- **F** — live on-chain `recordAssignment` / `finalizeReceipt` / `getReceipt` roundtrip

## Documentation index

- [`README.md`](../../README.md) — full user-facing reference
- [`docs/deployment/render.md`](../deployment/render.md) — Render step-by-step
- [`docs/implementation-decisions.md`](../implementation-decisions.md) — design log + trade-offs
- [`docs/security/threat-model.md`](../security/threat-model.md) — security model
- [`docs/atlantic-acceptance-scenarios.md`](../atlantic-acceptance-scenarios.md) — A–F scenarios
- [`docs/change-log.md`](../change-log.md) — change history

## License

MIT — see [`LICENSE`](../../../LICENSE). Free to use, modify, and distribute,
including commercially, as long as the copyright notice is preserved.
