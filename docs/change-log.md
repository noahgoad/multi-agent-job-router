# Change Log

This is a manual change log maintained in lieu of Git (which is not
available in the current sandbox). It mirrors the commit names listed
in
`docs\superpowers\plans\2026-06-13-multi-agent-job-router-master-plan.md`
in order. Each entry lists the date, the planned commit message, and
the files or directories touched.

## 2026-06-16

### feat: add local web demo runner

- `apps/api/src/main.ts` is a new CLI entry that actually binds
  the API socket. `apps/api/package.json` now points `start` at
  `dist/src/main.js` and `dev` at `src/main.ts`. The previous
  `start` script pointed at `dist/server.js`, which only exports
  `startServer` without calling it, so the API never bound a
  port. The vitest suite is unaffected because it imports
  `buildServer` directly.
- When `PHAROS_ROUTER_DEMO=1` is set, the API pre-seeds the
  in-process `AgentSkillRegistry` with a single trusted skill
  release + agent + heartbeat, so the dashboard demo has
  something to route against.
- `scripts/seed-demo.mjs` creates, approves, and executes a
  representative 3-task demo job and prints the dashboard URL.
- `scripts/demo.mjs` is a local end-to-end demo runner. It
  builds the workspaces, refuses to start if the target ports
  are in use, starts the API in demo mode, seeds the demo job,
  starts the Vite dev server in `apps/web` on `127.0.0.1`, and
  prints the dashboard URL. Ctrl-C cleanly stops both
  children.
- `apps/api/src/app.ts > executeJob > worker` now computes
  `outputHash` with `contentHash(output)` instead of a
  hard-coded placeholder, so the demo job's `hash` verifier
  actually passes and every task ends `VERIFIED`.
- Fixed nine workspace `package.json` files that were stored
  with a UTF-8 BOM. The BOM broke `tsx`'s `getPackageTypeSync`
  with `Error: Error parsing: <file>`. Stripped in this commit.

## 2026-06-16

### chore: close final acceptance

- Marked every item in
  `docs/implementation-checklist.md` Phase 12 as `[x]`. The
  underlying work was already complete (7/7 verify, 73/73
  vitest, 10/10 hardhat, 6/6 acceptance scenarios, plan
  preservation hashes match); the checklist was just carrying
  stale `[ ]` markers.
- Filled in the `Final SHA-256` column of
  `docs/plan-preservation-final-report.md` with the recomputed
  hashes for `README.md` and
  `docs/superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md`.
  Both match the originals byte-for-byte.
- Updated the report's conclusion to record the on-chain
  scenario F roundtrip as a permanent pass (the
  `docs/atlantic-acceptance-results.md` page already has the
  tx hashes and block numbers).

## 2026-06-16

### feat: implement all six acceptance scenarios

- Replaced the six stub shell scripts in
  `scripts/atlantic-acceptance/scenario-{a..f}.sh` with thin
  wrappers that delegate to a sibling Node.js script.
- Added `scripts/atlantic-acceptance/_shared.mjs` with the
  in-process `AgentSkillRegistry` setup used by every scenario,
  and the standard 3-task job spec.
- Added `scripts/atlantic-acceptance/scenario-{a,b,c,d,e}.mjs`:
  - **A** drives a happy-path 3-task job through the
    `Orchestrator` and asserts every task ends `VERIFIED` with
    the expected `totalSpent`.
  - **B** exercises the bounded-retry path (first two attempts
    fail, the third succeeds) and the persistent-failure path
    (worker always throws, task ends `FAILED`).
  - **C** makes the verifier return `ok = false` for t3, asserts
    t1 and t2 are `VERIFIED` and t3 is `FAILED`, and confirms
    the disagreement is recorded per-task rather than aborting
    the whole job.
  - **D** triggers the workflow compiler's `budget_overflow`
    validation directly and through the orchestrator; a spec
    whose per-task budgets sum to more than the job budget is
    rejected at compile time and the orchestrator marks every
    task `FAILED` with `totalSpent == 0`.
  - **E** exercises the `StaticGoplusClient` denylist and runs
    an end-to-end job where the worker consults GoPlus before
    submitting a financial task and aborts with
    `goplus_risky_target` when the target is denylisted.
- Added `scripts/atlantic-acceptance/scenario-f.mjs` that wraps
  the existing `on-chain-roundtrip.mjs` so the shell wrapper
  for scenario F can be re-implemented in the same style as
  A-E. Scenario F still requires the live deployer credentials
  in `.env` and `PHAROS_REGISTRY_ADDRESS`; the on-chain
  roundtrip recorded in `docs/atlantic-acceptance-results.md`
  is the canonical pass evidence.
- All six scenarios now exit with a non-zero code on failure,
  so a future CI gate can chain them.
- `docs/atlantic-acceptance-results.md` was updated to record
  the in-process scenario runs alongside the on-chain
  roundtrip.

## 2026-06-16

### feat: deploy multi agent router to atlantic testnet

- Generated a fresh Pharos Atlantic deployer wallet with
  `tools/create-wallet.mjs` (viem's `generatePrivateKey`).
  Private key written only to the gitignored `.env`; the
  public address is shared with the user for funding.
- Fixed the deploy script
  `packages/contracts/scripts/deploy.ts` to pass the deployer
  address to OpenZeppelin v5 `Ownable(initialOwner)`, and
  migrated it to the default-import pattern
  (`import hardhat from "hardhat"; const { ethers } = hardhat;`)
  for ESM/CJS interop.
- `packages/contracts/hardhat.config.cjs` now loads the
  project-root `.env` inline so `process.env.PHAROS_RPC_URL`
  and `process.env.ROUTER_DEPLOYER_PRIVATE_KEY` are populated
  for the deployer script (Hardhat itself does not auto-load
  `.env`).
- Deployed `JobRouterRegistry` to Pharos Atlantic
  (chain id 688689). Contract address:
  `0xa0d6F6fAf69201f432e9fc24cC2B0d4Aadca15f0`. Verified
  on-chain via `tools/verify-deploy.mjs`.
- Added `scripts/atlantic-acceptance/on-chain-roundtrip.mjs`
  that drives `recordAssignment` and `finalizeReceipt`
  against the live deployment, then reads `getReceipt` and
  compares the four roots with the local computation. Roundtrip
  passes; all four roots match and `isFinalized` is `true`.
- `docs/atlantic-acceptance-results.md` now records the
  deploy details, on-chain roundtrip output, and the status of
  scenarios A-F.
- Scenarios A-E remain stub shell scripts (`exit 0`) and
  require a running API server; they are the next
  infrastructure step in the master plan (Alibaba Cloud
  Function Compute deploy of the API).

### fix: align vitest, hardhat and verify with the current toolchain

- Added the missing `@pharos-router/contracts` alias to
  `vitest.config.ts` so the API test file can resolve
  `computeAssignmentRoot` / `computeResultRoot` from the
  contracts package source. With the alias in place, the API
  test suite (9 tests) loads and 73/73 vitest tests pass.
- Switched the Hardhat test runner from `ts-node/register` to
  `tsx` (already in the root devDependencies). `tsx` is the
  only TypeScript loader that handles the ESM/CJS interop
  correctly under the current Node 20+ toolchain. The contracts
  package keeps `"type": "module"` so the published output is
  ESM; the test files import the `hardhat` CJS module via the
  default-export pattern
  (`import hardhat from "hardhat"; const { ethers } = hardhat;`)
  to avoid the named-export trap.
- Updated the constructor calls in the contract tests to pass
  the initial owner address (`Factory.deploy(owner.address)`) to
  match OpenZeppelin v5 Ownable, and asserted the non-owner
  reverts with
  `revertedWithCustomError(..., "OwnableUnauthorizedAccount")`
  (the OZ v5 typed error that replaces the legacy `not_owner`
  string revert). Chai BDD style was changed from jest-style
  (`toThrow`, `toMatch`, `toBe`) to chai-style
  (`to.throw`, `to.match`, `to.equal`).
- Added the `contracts` step to `tools/verify.mjs` and replaced
  the `npx` invocations with direct `node` calls to the resolved
  tool paths. Also normalised the Windows `\\?\` extended-length
  temp path before spawning child processes so vitest's SSR
  cache (and a few other toolchain internals) does not try to
  create a directory at the literal `D:\?\...` path.
- Updated the root `package.json` `build` and `typecheck`
  scripts to use `tsc -b` (the root solution file) instead of
  the redundant explicit list of workspace directories that
  pointed at non-existent `tsconfig.json` files.
- Removed the orphan `hardhat.config.ts` (which referenced a
  non-existent `./type-extensions` module) and the obsolete
  `tsconfig.test.json` overrides; kept the
  `tsconfig.test.json` for the vitest test typecheck.
- 10/10 Hardhat contract tests now pass (was 0/10 in the
  sandbox). 73/73 vitest tests still pass. 7/7 verify steps
  pass.
- `npx tsc -b` produces 0 errors.

## 2026-06-14

### chore: initialize multi agent router

- Added `package.json`, `tsconfig.base.json`, `.gitignore`,
  `.env.example`, `README.dev.md`.
- Added `docs\isolation-verification.md`,
  `docs\plan-preservation-manifest.md`,
  `docs\implementation-checklist.md`,
  `docs\implementation-context.md`,
  `docs\implementation-decisions.md`,
  `docs\change-log.md`,
  `docs\environment-status.md`.
- Added `packages\policy\src\safety.ts` defining permission
  propagation, budget accounting, cancellation, retries, and
  human-in-the-loop rules.

### feat: define multi agent job protocol

- Added `packages\workflow\src\schema.ts` with strict TypeScript
  types and Zod schemas for `JobSpec`, `TaskSpec`, `AssignmentReceipt`,
  `TaskResult`, and `JobReceipt`.
- Added `packages\workflow\src\hash.ts` with deterministic
  keccak256-based hashing helpers.
- Added `packages\workflow\src\validation.ts` with cycle detection,
  reachability check, permission-budget-deadline validators.

### feat: add bounded workflow compiler

- Added `packages\workflow\src\compiler.ts` that converts a
  validated `JobSpec` into a `JobGraph` with critical path, budget
  allocations, and approval gates.
- Added `packages\workflow\src\qwen.ts` with a `QwenProposer`
  interface, a deterministic default proposer, and a Qwen-assisted
  proposer stub that must validate and be approved.
- Added `packages\workflow\test\compiler.test.ts` covering happy
  path, cycle rejection, budget overflow, unsupported capability,
  and Qwen proposal validation.

### feat: add agent capability registry

- Added `packages\registry\src\agents.ts` and
  `packages\registry\src\skills.ts` with registration, lookup,
  CertiK verdict attachment, and signed-heartbeat tracking.
- Added `packages\registry\test\registry.test.ts` covering
  registration, expired-release rejection, and endpoint-substitution
  detection.

### feat: add explainable agent routing

- Added `packages\routing\src\engine.ts` and
  `packages\routing\src\explain.ts` with weighted scoring, an
  explanation trace, and diversity/anti-collusion enforcement.
- Added `packages\routing\test\routing.test.ts` covering weighted
  selection, explanation output, and diversity enforcement.

### feat: add resilient multi agent orchestrator

- Added `services\orchestrator\src\runner.ts` with ready-task
  scheduling, least-privilege task token issuance, checkpoints,
  timeouts, bounded retries, reassignment, cancellation, and
  restart recovery.
- Added `services\orchestrator\test\orchestrator.test.ts` covering
  happy path, timeout retry, reassignment on failure, and
  cancellation.

### feat: add result verification pipeline

- Added `services\verifier\src\verifiers.ts` with schema, hash,
  deterministic-computation, transaction, and human verifiers.
- Added `services\verifier\src\aggregator.ts` that aggregates only
  verified dependency results.
- Added `services\verifier\test\verifier.test.ts` covering each
  verifier and the aggregator.

### feat: add routed job trust receipts

- Added `packages\contracts\contracts\JobRouterRegistry.sol` with
  assignment and terminal receipt anchoring.
- Added `packages\contracts\scripts\deploy.ts`,
  `packages\contracts\test\registry.test.ts`, and
  `packages\contracts\test\invariants.test.ts`.
- Added `services\orchestrator\src\goplus.ts` and
  `services\orchestrator\src\certik.ts` for GoPlus and CertiK
  integration.
- Added `packages\workflow\src\artifact.ts` for off-chain artifact
  storage keyed by content hash.

### feat: add router product interfaces

- Added `packages\sdk\src\client.ts` with typed operations.
- Added `apps\api\src\server.ts` (Fastify) exposing
  create/approve/route/execute/verify/cancel/retry/inspect.
- Added `apps\web\src\App.tsx` (React + Vite) with DAG, candidates,
  scores, budgets, evidence, and receipts.
- Added `apps\mcp\src\server.ts` exposing the router as MCP tools.
- Added `apps\web\test\app.test.tsx` for the dashboard.
### fix: align api and test data with current date and bigint json

- Updated `apps\api\test\server.test.ts` to use far-future
  `deadline` and `expiresAt` values so the deadline validator
  accepts the fixtures.
- Added a `bigintReplacer` + `jsonBody` test helper that
  pre-serializes bigints with a trailing `n` and supplies a
  matching `content-type: application/json` header so the
  light-my-request test harness does not throw on bigint
  payloads.
- Added a `addContentTypeParser` entry in `apps\api\src\server.ts`
  that revives `<digits>n` back into BigInt on the request
  body.
- Wrapped every JSON route in `apps\api\src\server.ts` with a
  `bigintSafe` helper that pre-serializes the response with a
  BigInt replacer so Fastify`s default JSON serializer never
  sees a BigInt.
- Updated the error handler in `apps\api\src\server.ts` to
  honour `err.statusCode` (e.g. `FST_ERR_CTP_BODY_TOO_LARGE`
  -> 413) instead of falling back to 500.
- Added the missing `pricingMicrousd: 0n` default to the
  `agent()` helper in `packages\routing\test\routing.test.ts`
  so BigInt arithmetic in `scoreCost` is well-defined.
- Added the `financial` capability to the registered agent
  and skill in `services\orchestrator\test\orchestrator.test.ts`
  so the `requires human approval for financial tasks` test
  can route the financial task and reach the approval gate.
- Imported `contentHash` into `apps\api\test\server.test.ts`.
- All 73 vitest tests across 9 files now pass.
- `npx tsc -b` produces 0 errors.