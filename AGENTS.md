# AGENTS.md

Context mirror of the project's agent skill. This file is the fallback for
agent tools that do not follow the `.agents/skills/<name>/SKILL.md` convention
(Aider, Continue.dev, custom agents, etc.). For the comprehensive reference,
see [`.agents/skills/pharos-multi-agent-job-router/SKILL.md`](.agents/skills/pharos-multi-agent-job-router/SKILL.md).

## What this project is

TypeScript npm-workspaces monorepo. A coordination layer that decomposes a
`JobSpec` into a DAG, selects qualified agents with a weighted score
(capability · trust · cost · latency · availability), verifies intermediate
results through a diversity filter, and anchors the final job receipt on
**Pharos Atlantic** (chainId `688689`).

## Layered package map (edit discipline)

Edit the narrowest layer that owns the behaviour you need. **Do not** edit
cross-cutting concerns from the wrong package.

| Concern | Edit here |
|---|---|
| HTTP shape, auth, CORS, rate limit, body limits | `apps/api` |
| Dashboard UI, polling, auto-play, retry+toast | `apps/web` |
| New MCP tool, tool args, financial-confirm gate | `apps/mcp` |
| DAG compilation, content hashing, cycle/deadline/budget validation | `packages/workflow` |
| Agent & skill records, CertiK verdicts, heartbeat freshness | `packages/registry` |
| Selection weights, diversity filter, explanation output | `packages/routing` |
| Least-privilege, budget accounting, retry bounds, HITL, hidden-delegation | `packages/policy` |
| Per-task execution, downstream cancellation, GoPlus/CertiK bridges | `services/orchestrator` |
| Verifier types (schema · hash · det · tx · human), verdict aggregation | `services/verifier` |
| On-chain `JobRouterRegistry`, viem Atlantic client, deploy script | `packages/contracts` |
| Typed client for the HTTP API | `packages/sdk` |

## Common commands

```bash
# Local dev (3 terminals)
node scripts/watch-api.cjs              # API under watchdog, port 8787
cd apps/web && npm run dev              # Vite dev server, port 5173
node scripts/seed-demo.mjs              # seed demo + play happy path

# Tests (must all pass before opening a PR)
npm test                               # vitest — 73 tests
npm run test:contracts                 # hardhat + mocha — 10 tests
npm run verify                         # full gate: tsc + vitest + hardhat + isolation + secret-scan

# Reset + replay the demo
curl -X POST http://127.0.0.1:8787/jobs/demo/reset \
  -H "Authorization: Bearer dev-token"
curl -X POST http://127.0.0.1:8787/jobs/demo/play \
  -H "Authorization: Bearer dev-token" -H "Content-Type: application/json" \
  -d '{"tickMs": 1500, "approver": "demo", "scenario": "happy"}'
```

Open the dashboard: <http://127.0.0.1:5173/?jobId=demo&authToken=dev-token>

## HTTP API surface (all `/jobs/*` need `Authorization: Bearer <token>`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/healthz` | Liveness |
| GET | `/jobs` | List jobs (newest first) |
| POST | `/jobs` | Create from JobSpec |
| GET | `/jobs/:id` | Inspect job (full state + DAG) |
| POST | `/jobs/:id/approve` | Record approval `{ approver }` |
| POST | `/jobs/:id/route` | Dry-run routing |
| POST | `/jobs/:id/execute` | Run ready tasks |
| POST | `/jobs/:id/verify` | Re-run verifier set |
| POST | `/jobs/:id/cancel` | Cancel + propagate |
| POST | `/jobs/:id/retry` | Retry one task `{ taskId }` |
| POST | `/jobs/:id/reset` | Reset terminal job to PLANNED |
| POST | `/jobs/:id/play` | Slow-motion execute (`tickMs`, `approver`, `scenario`) |

## MCP tools (`pharos_router_*` prefix, stdio server)

Read: `inspect`. Write: `create`, `approve`, `route`, `verify`, `cancel`,
`retry`. **Financial** (requires `args.confirm === true`): `execute`.

## Task state machine

```
PLANNED → ASSIGNED → RUNNING → VERIFIED
                          ↓
                       FAILED → CANCELLED
                          ↓
                       CANCELLED  (parent cancelled)
```

Every transition is recorded on-chain — not just terminal states.

## Critical env vars

- `PHAROS_RPC_URL` (default: `https://atlantic.dplabs-internal.com`)
- `PHAROS_CHAIN_ID` (`688689`)
- `PHAROS_ROUTER_AUTH_TOKEN` (default: `dev-token` — **must override in prod**)
- `MIN_AGENT_TRUST_SCORE` (`60`)
- `MIN_VERIFIER_DIVERSITY` (`2`)
- `PHAROS_ROUTER_DATA_DIR` (if set, FileStorage persists `jobs.json`)
- `PHAROS_ROUTER_AUTO_SEED` (`1` re-creates demo job on empty store, free-tier workaround)
- `ROUTER_DEPLOYER_PRIVATE_KEY` — **never commit**, set via Render dashboard

## Render deployment gotchas

- Two Web Services from `render.yaml`: `pharos-router-api` (Node) and `pharos-router-web` (Node serving Vite build via `serve.mjs`).
- Free tier has no persistent disk → `JobStore` resets on cold start; `PHAROS_ROUTER_AUTO_SEED=1` compensates.
- `buildCommand` **must** use `--include=dev` — Render's `NODE_ENV=production` otherwise skips devDependencies (TypeScript, Vite, Vitest, Hardhat).
- Node version pinned via `.nvmrc` at repo root.
- `ROUTER_DEPLOYER_PRIVATE_KEY` cannot live in YAML (would be committed) — set manually in Render Environment tab.
- `CORS_ORIGINS` is a comma-separated list — add the Vercel origin after first Vercel deploy.

## Vercel deployment (web dashboard)

- The dashboard is hosted on Vercel for faster cold starts than Render's free tier.
- `vercel.json` at the repo root: installCommand `npm ci --include=dev`, buildCommand `npm run build && cd apps/web && npx vite build`, outputDirectory `apps/web/dist`.
- Requires build-time env var `VITE_API_BASE` pointing to the Render API URL (e.g. `https://pharos-router-api-jrst.onrender.com`).
- Run `vercel --prod` from the repo root to deploy; preview deployments on every PR.
- See [`docs/deployment/vercel.md`](docs/deployment/vercel.md) for the full step-by-step.

## Stability features

1. **FileStorage** — atomic write + BigInt-safe JSON, used on paid Render plans.
2. **Watchdog** — `scripts/watch-api.cjs` restarts API within 3s of unexpected exit, gives up after 10 consecutive crashes.
3. **Frontend retry + toast** — `DashboardLoaded` polls with exponential backoff (1s → 30s cap) via `setTimeout`; `ApiDownToast` shows live countdown.
4. **Auto-play + auto-seed** — `runAuto("happy")` on first load when all tasks are PLANNED; `?autoplay=0` disables. Server-side `PHAROS_ROUTER_AUTO_SEED=1` re-creates the demo job on empty store.

## Acceptance scenarios (`scripts/atlantic-acceptance/`)

A — 3-task VERIFIED, totalSpent == 3000.  
B — bounded-retry + persistent-failure.  
C — verifier disagreement + per-task recording.  
D — compile-time `budget_overflow` + orchestrator catch.  
E — GoPlus denylist + worker abort.  
F — live on-chain `recordAssignment` / `finalizeReceipt` / `getReceipt` roundtrip.

## Where to find more

- [`README.md`](README.md) — full user-facing reference
- [`.agents/skills/pharos-multi-agent-job-router/SKILL.md`](.agents/skills/pharos-multi-agent-job-router/SKILL.md) — comprehensive agent skill
- [`docs/deployment/render.md`](docs/deployment/render.md) — Render step-by-step
- [`docs/implementation-decisions.md`](docs/implementation-decisions.md) — design log
- [`docs/security/threat-model.md`](docs/security/threat-model.md) — security model
- [`docs/atlantic-acceptance-scenarios.md`](docs/atlantic-acceptance-scenarios.md) — A–F scenarios

## Security reminders for the agent

- Never write `ROUTER_DEPLOYER_PRIVATE_KEY`, `QWEN_API_KEY`, `GOPLUS_API_KEY`, `CERTIK_API_KEY`, or `PHAROS_ROUTER_AUTH_TOKEN` values into source files, configs, or commit messages.
- Error responses never echo stack traces or secrets — preserve that contract.
- The dashboard must never use `dangerouslySetInnerHTML`.
- CORS allow-list is explicit; do not widen without a threat-model review.
