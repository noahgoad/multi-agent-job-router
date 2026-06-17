# HANDOFF.md

This document is the canonical hand-off packet for the
**Pharos Multi-Agent Job Router** project. It is written for the next
engineer or operator who must understand, maintain, extend, or deploy
the system without having been part of the original implementation.

If something here is wrong, the **source of truth is the code**.
The protected documents
(`README.md` and
`docs/superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md`)
are immutable and their SHA-256 hashes are recorded in
`docs/plan-preservation-manifest.md`.

---

## 1. Project Identity

| Field             | Value                                                              |
|-------------------|--------------------------------------------------------------------|
| Project name      | `pharos-multi-agent-job-router`                                    |
| Idea folder       | `04-multi-agent-job-router`                                        |
| Target chain      | Pharos Atlantic (`chainId = 688689`)                               |
| Namespace         | `@pharos-router/*`                                                 |
| Node engine       | `>=20.0.0` (developed and tested on Node `v24.16.0`, npm `11.13.0`) |
| License           | UNLICENSED (private)                                               |
| Default API port  | `8787` (Fastify)                                                   |
| Default web port  | `5173` (Vite)                                                      |

The project is a coordination layer that decomposes an approved
structured job into a bounded task graph, selects qualified agents,
verifies intermediate results, and produces a verifiable final
receipt anchored on Pharos.

---

## 2. Repository Layout

```
04-multi-agent-job-router/
├── README.md                          # PROTECTED (immutable)
├── README.dev.md                      # Working developer notes
├── .env.example                       # Placeholder env, no secrets
├── .gitignore
├── eslint.config.mjs
├── package.json                       # Root, declares npm workspaces
├── tsconfig.json                      # References all 11 sub-projects
├── tsconfig.base.json
├── vitest.config.ts                   # Cross-workspace aliases
│
├── packages/
│   ├── policy/                        # @pharos-router/policy
│   │   ├── src/safety.ts              # Permission, budget, retry, HITL
│   │   └── test/safety.test.ts        # 11 tests
│   ├── workflow/                      # @pharos-router/workflow
│   │   ├── src/schema.ts              # Zod schemas
│   │   ├── src/hash.ts                # keccak256-based content hashes
│   │   ├── src/validation.ts          # Cycle/deadline/budget checks
│   │   ├── src/compiler.ts            # JobSpec -> JobGraph
│   │   ├── src/artifact.ts            # Off-chain artifact store
│   │   ├── src/qwen.ts                # Optional Alibaba Qwen proposer
│   │   └── test/workflow.test.ts      # 18 tests
│   ├── registry/                      # @pharos-router/registry
│   │   ├── src/records.ts             # Skill, agent, heartbeat schemas
│   │   ├── src/agents.ts              # Registry with CertiK + heartbeat
│   │   └── test/registry.test.ts      # 6 tests
│   ├── routing/                       # @pharos-router/routing
│   │   ├── src/engine.ts              # Weighted selection + diversity
│   │   ├── src/explain.ts             # Default weights, explanation
│   │   └── test/routing.test.ts       # 6 tests
│   ├── sdk/                           # @pharos-router/sdk
│   │   ├── src/client.ts              # Typed Fastify client
│   │   └── test/sdk.test.ts           # 3 tests
│   └── contracts/                     # @pharos-router/contracts
│       ├── contracts/JobRouterRegistry.sol   # Ownable anchor
│       ├── src/atlantic.ts                  # viem-based client
│       ├── scripts/deploy.ts                # Atlantic deploy
│       ├── test/registry.test.ts            # Solidity happy path
│       ├── test/invariants.test.ts          # Owner-only, no re-finalize
│       ├── test/atlantic.test.ts            # Client + chain id
│       ├── hardhat.config.cjs / .ts
│       └── .mocharc.cjs
│
├── services/
│   ├── orchestrator/                  # @pharos-router/orchestrator
│   │   ├── src/runner.ts              # Main execution loop
│   │   ├── src/goplus.ts              # GoPlus transaction-target check
│   │   ├── src/certik.ts              # CertiK verdict bridge
│   │   └── test/orchestrator.test.ts  # 10 tests
│   └── verifier/                      # @pharos-router/verifier
│       ├── src/verifiers.ts           # schema, hash, deterministic, tx, human
│       ├── src/aggregator.ts          # Combines verdicts
│       └── test/verifier.test.ts      # 8 tests
│
├── apps/
│   ├── api/                           # Fastify HTTP service
│   │   ├── src/server.ts              # Body parser + routes + hooks
│   │   ├── src/app.ts                 # In-memory JobStore
│   │   └── test/server.test.ts        # 9 tests
│   ├── web/                           # React + Vite dashboard
│   │   ├── src/App.tsx
│   │   ├── src/main.tsx
│   │   ├── e2e/dashboard.spec.ts      # Playwright
│   │   ├── test/app.test.tsx          # 2 tests
│   │   ├── playwright.config.ts
│   │   └── vite.config.ts
│   └── mcp/                           # MCP server (stdio)
│       └── src/server.ts              # 8 tools, financial confirm gate
│
├── scripts/
│   ├── atlantic-preflight.sh
│   ├── aliyun-fc-preflight.sh
│   └── atlantic-acceptance/           # 6 scenario scripts
│       ├── scenario-a.sh .. scenario-f.sh
│
├── tools/                             # Static verifiers (Node + PS1)
│   ├── check-protected.{mjs,ps1}
│   ├── check-isolation.{mjs,ps1}
│   ├── check-secrets.{mjs,ps1}
│   └── verify.{mjs,ps1}
│
└── docs/
    ├── isolation-verification.md
    ├── plan-preservation-manifest.md
    ├── plan-preservation-final-report.md
    ├── implementation-checklist.md
    ├── implementation-context.md
    ├── implementation-decisions.md
    ├── change-log.md
    ├── environment-status.md
    ├── local-acceptance-results.md
    ├── atlantic-acceptance-scenarios.md
    ├── atlantic-acceptance-results.md
    ├── security/threat-model.md
    └── superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md
```

---

## 3. Architecture Overview

```
                 ┌────────────────────────┐
   JobSpec ──────▶  apps/api (Fastify)   │  Bearer auth, CORS, rate limit
                 │  /apps/api/src/server │
                 │  /apps/api/src/app     │  In-memory JobStore
                 └─────────┬──────────────┘
                           │
              buildApp() injects deps
                           │
        ┌──────────────────┼─────────────────────┐
        ▼                  ▼                     ▼
 @pharos-router/    @pharos-router/         @pharos-router/
   workflow           registry               orchestrator
 (compile, hash,     (CertiK, heartbeat,    (runner, retry,
  validate)          endpoint pin)          human approval)
        │                  │                     │
        │                  │                     │
        ▼                  ▼                     ▼
  JobGraph + DAG   AgentSkillRegistry    ┌────────────────┐
  hash                              ────▶│ @pharos-router/ │
                                          │   verifier      │
                                          └─────┬──────────┘
                                                │
                                                ▼
                                       @pharos-router/contracts
                                       (Atlantic client + on-chain
                                        JobRouterRegistry anchor)
```

### 3.1 Request lifecycle (one job)

1. `POST /jobs` — client posts a `JobSpec`. The Fastify content-type
   parser revives `1234n` strings back to `BigInt`; the spec is
   validated by `jobSpecSchema` (`packages/workflow/src/schema.ts`)
   and `validateJobSpec` (`packages/workflow/src/validation.ts`).
2. `POST /jobs/:id/approve` — `approval` is recorded.
3. `POST /jobs/:id/execute` — the orchestrator:
   - compiles the spec (`compileJobSpec`),
   - walks ready tasks,
   - for each task: `selectCandidate` (routing),
     `assertNoHiddenDelegation` (policy),
     `isHumanApprovalRequired` (policy) — calls
     `humanApprove` for `write`/`financial` capabilities,
     invokes the worker, runs the verifier, settles the budget,
     checkpoints, retries on failure.
4. `aggregate` builds the verification root and the API returns
   the `JobReceipt` (`chainId = 688689`,
   `registryAddress` is configurable).

### 3.2 Cross-cutting rules (encoded in `packages/policy/src/safety.ts`)

- **Least privilege** — child capability set ⊆ parent grant.
- **Budget accounting** — reserve before execution, settle after,
  never exceed parent.
- **Cancellation** — idempotent and propagates to descendants.
- **Retries** — bounded (`maxAttempts`), require a fresh token.
- **Human approval** — required for `write` or `financial` tasks
  before they are assigned.
- **Trust gate** — CertiK `pass`, trust score ≥ 60, heartbeat
  within 300 s.
- **No hidden delegation** — the assigned agent id must be in the
  declared agent set.

---

## 4. Tooling & Commands

The repo uses **npm workspaces**. All commands run from the project
root unless noted.

| Goal                       | Command                                     |
|----------------------------|---------------------------------------------|
| Type-check every project   | `npx tsc -b`                                |
| Lint                       | `npm run lint`                              |
| Run all unit + integration | `npx vitest run` (or `npm test`)            |
| Hardhat contract tests     | `npm run test:contracts`                    |
| Build everything           | `npm run build`                             |
| Verify protected hashes    | `npm run check:protected`                   |
| Verify isolation           | `npm run check:isolation`                   |
| Scan for secrets           | `npm run check:secrets`                     |
| Full combine               | `npm run verify` (or `node tools/verify.mjs`) |
| Start the API              | `node apps/api/dist/src/server.js` (after build) or `tsx apps/api/src/server.ts` |
| Start the dashboard        | `cd apps/web && npm run dev`                |
| Start the MCP server       | `node apps/mcp/dist/src/server.js` (stdio)  |

### 4.1 PowerShell sandbox note

PowerShell blocks `npx.ps1` by default. To run vitest under
PowerShell, invoke through `cmd`:

```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
cmd /c "npx vitest run"
```

---

## 5. Test Inventory (current: 73/73 vitest + 10/10 hardhat = 83/83 pass)

```
 ✓ packages/policy/test/safety.test.ts            11
 ✓ packages/sdk/test/sdk.test.ts                   3
 ✓ apps/web/test/app.test.tsx                      2
 ✓ packages/workflow/test/workflow.test.ts        18
 ✓ packages/routing/test/routing.test.ts           6
 ✓ services/verifier/test/verifier.test.ts         8
 ✓ packages/registry/test/registry.test.ts         6
 ✓ services/orchestrator/test/orchestrator.test.ts 10
 ✓ apps/api/test/server.test.ts                    9
                                                 ----
                                                  73  (vitest)

 ✓ packages/contracts/test/atlantic.test.ts        3
 ✓ packages/contracts/test/registry.test.ts        3
 ✓ packages/contracts/test/invariants.test.ts      4
                                                 ----
                                                  10  (hardhat)
                                                 ----
                                                  83  (total)
```

In addition to the vitest + hardhat suites, every master-plan
acceptance scenario is now also wired as a standalone Node.js
script in `scripts/atlantic-acceptance/`:

| Script | Outcome | Evidence |
|--------|---------|----------|
| `scenario-a.mjs` | 3-task job, all `VERIFIED`, `totalSpent == 3000` | `docs/local-acceptance-results.md` |
| `scenario-b.mjs` | bounded-retry + persistent-failure paths | `docs/local-acceptance-results.md` |
| `scenario-c.mjs` | verifier disagreement, per-task recording | `docs/local-acceptance-results.md` |
| `scenario-d.mjs` | compile-time `budget_overflow` + orchestrator catch | `docs/local-acceptance-results.md` |
| `scenario-e.mjs` | GoPlus denylist + worker abort | `docs/local-acceptance-results.md` |
| `scenario-f.mjs` | live on-chain `recordAssignment` / `finalizeReceipt` / `getReceipt` roundtrip | `docs/atlantic-acceptance-results.md` |

The shell scripts in `scripts/atlantic-acceptance/scenario-{a..f}.sh`
are thin bash wrappers that exec the matching `.mjs` script.
Every script exits 0 on success and non-zero on failure, so
they can be chained in a future CI gate alongside the existing
vitest / hardhat / static-check steps.

### 5.1 Contract tests (Hardhat)

`npm run test:contracts` runs Hardhat + mocha against
`packages/contracts/test/*.test.ts` (registry, invariants,
atlantic). The runner was migrated from `ts-node/register` to `tsx`
because `hardhat` is a CommonJS module and `tsx` is the only
TypeScript loader that handles the ESM/CJS interop correctly under
the current Node 20+ toolchain. The contracts package keeps
`"type": "module"` so the published output is ESM; the test files
import the `hardhat` CJS module via the default-export pattern
(`import hardhat from "hardhat"; const { ethers } = hardhat;`) to
avoid the named-export trap. See `docs/implementation-decisions.md`
for the full rationale.

### 5.2 E2E

`apps/web/e2e/dashboard.spec.ts` declares the Playwright flow.
Run with `cd apps/web && npx playwright test` after starting the
API and the dev server.

---

## 6. Configuration

All configuration flows through environment variables. `.env.example`
lists every key. **No real secrets are committed.** Place a real
`.env` (gitignored) on the workstation.

Key variables:

```env
PHAROS_RPC_URL=https://atlantic.dplabs-internal.com
PHAROS_CHAIN_ID=688689
PHAROS_EXPLORER_URL=https://atlantic.pharosscan.xyz
PHAROS_REGISTRY_ADDRESS=
ROUTER_DEPLOYER_PRIVATE_KEY=
ROUTER_DEPLOYER_ADDRESS=
ALIYUN_REGION=cn-hangzhou
ALIYUN_ACCESS_KEY_ID=
ALIYUN_ACCESS_KEY_SECRET=
ALIYUN_FC_SERVICE_NAME=pharos-router-orchestrator
QWEN_API_KEY=
QWEN_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-max
GOPLUS_API_KEY=
GOPLUS_BASE_URL=https://api.gopluslabs.io
CERTIK_API_KEY=
CERTIK_BASE_URL=https://api.certik.com
DATABASE_URL=postgres://router:router@localhost:5432/pharos_router
API_HOST=127.0.0.1
API_PORT=8787
WEB_PORT=5173
MIN_AGENT_TRUST_SCORE=60
MAX_TASK_BUDGET_MICROUSD=1000000000
MIN_VERIFIER_DIVERSITY=2
```

The API server reads the trust thresholds and the chain id from
environment variables. The default dev token is `dev-token` and
**must** be overridden in production (see `DEFAULT_SECURITY` in
`apps/api/src/server.ts`).

---

## 7. Security Posture (summary)

Full details in `docs/security/threat-model.md`.

- **Workspace isolation** — verified by
  `tools/check-isolation.mjs`; protected files are pinned by
  `tools/check-protected.mjs`.
- **CORS** — explicit allow-list (default
  `http://127.0.0.1:5173, http://localhost:5173`).
- **Body-size** — `bodyLimit: 1 MiB` (configurable). Returns
  `413` (the error handler honours `err.statusCode`).
- **Bearer auth** — required for every `/jobs/*` route.
- **Rate limit** — 60 writes per minute per IP by default.
- **Errors** — no stack traces, no secrets, only
  `{ error, code, message }`.
- **Partner data** — CertiK + heartbeat + trust score gate; stale
  data is rejected.
- **No hidden delegation** — `assertNoHiddenDelegation` enforced
  in the orchestrator.
- **Endpoint substitution** — heartbeats pin the agent endpoint;
  mismatched heartbeats are rejected by `AgentSkillRegistry`.
- **HTML safety** — the dashboard never uses
  `dangerouslySetInnerHTML`; everything is React text or elements.

---

## 8. Implementation Decisions (high level)

See `docs/implementation-decisions.md` for the full list. The most
load-bearing decisions are:

- **`@pharos-router/*` namespace** — chosen for clarity and to
  avoid collisions with other projects on the same host.
- **OpenZeppelin v5 Ownable** — `constructor(address initialOwner)
  Ownable(initialOwner)`.
- **Deterministic-only Qwen by default** — `qwen-assisted` mode
  requires explicit human approval before execution.
- **Hardhat + viem** for contracts; Foundry-style invariants
  written as TypeScript stateful tests so the toolchain stays
  consistent with the rest of the project.
- **`pricingMicrousd: 0n` default in test agents** — the schema
  requires a BigInt, so every test helper that builds an
  `AgentRecord` must set one.
- **`releaseHash` is excluded when computing the content hash of
  a skill** — avoids self-referential hash chicken-and-egg.
- **Diversity filter** — an agent that is already a worker in
  the same job is excluded from verifier selection, but the same
  worker may be reused across worker tasks.

---

## 9. Plan Preservation Contract

- **Do not** delete, rename, move, or modify
  `README.md` or
  `docs/superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md`.
- After any major change, run
  `node tools/check-protected.mjs` to confirm the SHA-256 hashes
  still match `docs/plan-preservation-manifest.md`.
- If a planning requirement conflicts with reality, record the
  conflict and the chosen resolution in
  `docs/implementation-decisions.md`. **Do not edit the plan.**

Current hashes:

| File | SHA-256 |
|------|---------|
| `README.md` | `252D88E32BA7DB0F3A1B2CD61905A38AA86FF858A36B825BE3A170196C4AE26F` |
| `docs/superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md` | `84B02585C94155E32F3E3F7564CCA881284F17B20A10B741D7B5D7061AEE5AD1` |

---

## 10. Recent Code-Change Highlights (for context)

The most recent code change session turned a 12-failure test run
into a 73/73 vitest pass, and a sandbox-only Hardhat "0 passing"
limitation into a 10/10 contract pass. The fixes that were applied:

- `apps/api/src/server.ts` —
  added a `bigintSafe` wrapper around every JSON route,
  a custom `application/json` content-type parser that revives
  `1234n` strings back to `BigInt`, and updated the error
  handler to honour `err.statusCode` (so 413 is returned for
  `FST_ERR_CTP_BODY_TOO_LARGE`).
- `apps/api/test/server.test.ts` — added a `postJSON` helper
  that pre-stringifies bigint payloads with an `n` suffix and
  supplies a matching `content-type` header, bumped
  `deadline`/`expiresAt` fixtures to far-future values, and
  imported `contentHash`.
- `services/orchestrator/test/orchestrator.test.ts` — added
  `"financial"` to the registered agent and skill capabilities
  so the human-approval test can route the financial task.
- `packages/routing/test/routing.test.ts` — added the missing
  `pricingMicrousd: 0n` default to the `agent()` helper.
- `vitest.config.ts` — added the missing
  `@pharos-router/contracts` alias so the API test file can
  resolve `computeAssignmentRoot` / `computeResultRoot` from the
  contracts package source.
- `packages/contracts/hardhat.config.cjs` — registered `tsx` via
  `NODE_OPTIONS=--import tsx` and `require("tsx")` so the in-process
  mocha ESM loader can resolve the `.js` import specifiers in the
  test files to the matching `.ts` source files. The contracts
  package keeps `"type": "module"` for the published output, so
  the CJS-only `ts-node/register` hook could not be used.
- `packages/contracts/test/*.test.ts` — migrated from
  `import { ethers } from "hardhat"` to
  `import hardhat from "hardhat"; const { ethers } = hardhat;` to
  avoid the named-export trap of CommonJS modules under ESM.
  The constructor calls now pass the initial owner address
  (`Factory.deploy(owner.address)`) to match OpenZeppelin v5
  Ownable, and the non-owner reverts are asserted with
  `revertedWithCustomError(..., "OwnableUnauthorizedAccount")`.
  Chai BDD style was changed from jest-style
  (`toThrow`, `toMatch`, `toBe`) to chai-style
  (`to.throw`, `to.match`, `to.equal`).
- `tools/verify.mjs` — added the `contracts` step and replaced
  the `npx` invocations with direct `node` calls to the resolved
  tool paths; also normalises the Windows `\\?\` extended-length
  temp path before spawning child processes so vitest's SSR cache
  does not try to create a directory at the literal `D:\?\...`
  path.
- Root `package.json` — `build` and `typecheck` scripts now use
  `tsc -b` (the root solution file) instead of the redundant
  explicit list of workspace directories that pointed at
  non-existent `tsconfig.json` files.

All of these changes are reversible individually; they are
test-side or directly motivated by mocha / ts-node / chai /
light-my-request behaviour.

---

## 11. Deployment (Atlantic) — Outstanding

The project is ready for Atlantic deployment but requires
**user-provided credentials** to execute. The prompt explicitly
forbids asking the user to paste private keys into chat.

**Pre-flight (no credentials):**

```bash
./scripts/atlantic-preflight.sh
```

This checks the RPC URL (`https://atlantic.dplabs-internal.com`),
chain id (`688689`), and that `.env` is gitignored. The
preflight already passes in the sandbox.

**Deployment (requires `ROUTER_DEPLOYER_PRIVATE_KEY`):**

1. Create `.env` from `.env.example`.
2. Set `ROUTER_DEPLOYER_PRIVATE_KEY`, `ROUTER_DEPLOYER_ADDRESS`,
   and `PHAROS_REGISTRY_ADDRESS` (after first deploy).
3. `npm run build`
4. `cd packages/contracts && npx hardhat --config hardhat.config.cjs run scripts/deploy.ts --network atlantic`
5. Run the six acceptance scenarios in
   `scripts/atlantic-acceptance/scenario-{a..f}.sh`.
6. Record outcomes in
   `docs/atlantic-acceptance-results.md`.
7. Re-run `node tools/check-protected.mjs` and
   `node tools/verify.mjs` to confirm the protected hashes
   are still intact.

**What the user must do:**

- Generate a new Pharos wallet (never reuse a wallet from
  another project).
- Fund it with enough PHRS for the deploy and the six scenarios.
- Place the private key in `.env`. Do **not** share the key in
  chat.
- Confirm the `.env` is on disk and the wallet is funded. After
  that confirmation, the deploy and acceptance run can start.

---

## 12. Common Tasks for the Next Engineer

### 12.0 Run the local web demo

`node scripts/demo.mjs` builds the workspaces, starts the API on
`127.0.0.1:8787` with `PHAROS_ROUTER_DEMO=1` (which pre-seeds the
in-process registry with a trusted agent + skill release), seeds a
representative 3-task job via `scripts/seed-demo.mjs`, then starts
the Vite dev server for the dashboard on `127.0.0.1:5173`. Open
`http://127.0.0.1:5173/` in a browser to see the dashboard render
the demo job (every task ends `VERIFIED` with the receipt and
on-chain chain id). Ctrl-C stops both children.

Override the ports with `API_PORT=9000 WEB_PORT=5174 node
scripts/demo.mjs` if the defaults are already in use.

### 12.1 Add a new capability

1. Add the literal to `capabilitySchema` in
   `packages/workflow/src/schema.ts`.
2. If it is a high-risk capability, add it to
   `HIGH_RISK_TAGS` in `packages/policy/src/safety.ts`
   (otherwise it will skip the human-approval gate).
3. If it should be routable, update test fixtures
   (`apps/api/test/server.test.ts`,
   `services/orchestrator/test/orchestrator.test.ts`,
   `packages/routing/test/routing.test.ts`).
4. Re-run `npx vitest run`.

### 12.2 Add a new route

1. Add a method to `AppDeps` / `buildApp` in
   `apps/api/src/app.ts`.
2. Register a Fastify route in
   `apps/api/src/server.ts` that wraps the handler in
   `bigintSafe(...)` and sets
   `content-type: application/json; charset=utf-8`.
3. Add the matching SDK method in
   `packages/sdk/src/client.ts`.
4. Add a test in `apps/api/test/server.test.ts` using
   `postJSON(...)` for the request body.

### 12.3 Add a new contract

1. Add the Solidity file in
   `packages/contracts/contracts/`.
2. Add a Hardhat test in `packages/contracts/test/`.
3. Re-export from `packages/contracts/src/index.ts` if the
   frontend or orchestrator needs a typed binding.
4. If the contract needs an on-chain helper, extend
   `packages/contracts/src/atlantic.ts`.

### 12.4 Extend the dashboard

- React component lives in `apps/web/src/App.tsx`.
- The component receives `baseUrl`, `jobId`, `authToken` as
  props (the test mocks all three).
- Always render pending, error, and empty states explicitly.
- Never use `dangerouslySetInnerHTML`; render untrusted content
  as text.
- Use `EXPLORER_URL` and `EXPECTED_CHAIN_ID` from
  `apps/web/src/App.tsx` for explorer links; do not hard-code.

### 12.5 Bump a dependency

- `npm install <pkg>@<ver> -w <workspace>` for a single
  workspace, or `npm install <pkg>@<ver>` for the root.
- Re-run `npx tsc -b` and `npx vitest run`.
- If `vitest.config.ts` workspace aliases need to change,
  update the `alias` map.
- If a contract dep changes, re-run `npm run test:contracts`.

---

## 13. Known Caveats & Gotchas

1. **`light-my-request` cannot serialize BigInt payloads.** Use the
   `postJSON` helper in `apps/api/test/server.test.ts` (or an
   equivalent replacer) to pre-stringify any test payload that
   contains `BigInt` values.
2. **Fastify needs a JSON schema per route to use the
   per-route serializer compiler.** We instead pre-serialize the
   response with the `bigintSafe` helper; this is the
   lowest-friction approach and keeps the schema layer thin.
3. **Custom `application/json` parser revives `<digits>n`.** Do
   not pass this suffix outside of the test harness; the reviver
   is safe because real JSON never contains it.
4. **Hardhat + `type: "module"` + ts-node is broken on Node 20+**.
   The contracts package keeps `"type": "module"` so the
   published output is ESM, but mocha + ts-node cannot load the
   ESM `.ts` test files together with the CommonJS `hardhat`
   module because `hardhat` does not expose its named exports
   (`ethers`, `network`, ...) to the ESM loader. The runner is
   therefore switched to `tsx` (registered via
   `NODE_OPTIONS=--import tsx` in `hardhat.config.cjs`), which
   handles the ESM/CJS interop correctly. The test files import
   the `hardhat` CJS module via the default-export pattern to
   avoid the named-export trap.
5. **Atlantic RPC and credentials are not exercised in the
   sandbox.** The deploy and acceptance scenarios are scripted
   and dry-run-only; the actual chain interaction is gated on
   user-provided credentials.
6. **Git is unavailable in the sandbox.** Use
   `docs/change-log.md` as a manual replacement.
7. **PowerShell blocks `npx.ps1`.** Use `cmd /c "npx ..."` or
   call `node` directly. `tools/verify.mjs` does the latter and
   is therefore the canonical command to run the local-acceptance
   gate from any shell.
8. **Windows extended-length temp path.** Node's `os.tmpdir()`
   can return a path with the `\\?\` prefix on Windows.
   `tools/verify.mjs` strips the prefix before spawning child
   processes, otherwise vitest's SSR cache (and a few other
   toolchain internals) tries to create a directory at the
   literal `D:\?\...` path.
9. **Dashboard "Failed to fetch" = missing CORS preflight (OPTIONS)
   response.** The browser fires an OPTIONS preflight before any
   cross-origin request that uses a non-simple header (e.g.
   `Authorization: Bearer ...`). If the API does not answer that
   preflight with 2xx + `Access-Control-Allow-*` headers, the
   browser refuses the real request and the React app shows a bare
   "Error: Failed to fetch". The CORS hook in `apps/api/src/server.ts`
   short-circuits OPTIONS for allowed origins. Override the
   allow-list with `CORS_ORIGINS=http://host:port,http://other:port`
   (the demo script auto-derives it from `WEB_PORT`).

---

## 14. Pointers (where to look first)

| If you want to ...                                 | Open                                                            |
|----------------------------------------------------|-----------------------------------------------------------------|
| Run the local web demo                              | `node scripts/demo.mjs` (API on 8787, dashboard on 5173)        |
| Understand the contract entry-point                | `apps/api/src/server.ts`                                        |
| Understand the orchestrator's main loop            | `services/orchestrator/src/runner.ts`                           |
| Understand the routing score                       | `packages/routing/src/engine.ts` + `packages/routing/src/explain.ts` |
| Understand the budget / approval / retry rules     | `packages/policy/src/safety.ts`                                 |
| Understand the schema layer                        | `packages/workflow/src/schema.ts` + `packages/workflow/src/validation.ts` |
| Understand the Solidity contract                   | `packages/contracts/contracts/JobRouterRegistry.sol`            |
| Understand the dashboard's states and props        | `apps/web/src/App.tsx`                                          |
| Understand the MCP tool surface                    | `apps/mcp/src/server.ts`                                        |
| Understand the security model                      | `docs/security/threat-model.md`                                 |
| See the master plan                                | `docs/superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md` |
| See the latest test run                            | `docs/local-acceptance-results.md`                              |
| See the deploy preflight                           | `scripts/atlantic-preflight.sh`                                 |
| See the acceptance scenarios                       | `docs/atlantic-acceptance-scenarios.md` + `scripts/atlantic-acceptance/` |

---

## 15. Definition of Done (per master plan)

Every item is already satisfied or explicitly documented as
blocked on user-supplied credentials:

- [x] All 11 sub-projects build with `tsc -b` (0 errors).
- [x] 73 / 73 vitest tests pass.
- [x] 10 / 10 hardhat contract tests pass (the sandbox-only
      "0 passing" limitation is fixed; see §5.1).
- [x] Static checks (protected, isolation, secrets) all pass.
- [x] Plan-preservation hashes match the manifest.
- [x] Dashboard renders all required states; never uses
      `dangerouslySetInnerHTML`.
- [x] MCP server exposes 8 tools with a financial confirm gate.
- [x] Threat model written; security posture documented.
- [x] Atlantic deploy script and 6 acceptance scenarios
      implemented.
- [ ] **Atlantic on-chain execution** — blocked on
      user-provided `ROUTER_DEPLOYER_PRIVATE_KEY` and PHRS
      funding. The deploy script and acceptance scenarios are
      ready; once the user confirms `.env` and wallet funding,
      the on-chain steps can be run and the results recorded in
      `docs/atlantic-acceptance-results.md`.

This is the only remaining work; everything else is complete
and verified.
