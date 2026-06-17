# Local Acceptance Results

This file records the local acceptance verification performed
against the Pharos Multi-Agent Job Router. Each entry lists the
command, the expected outcome, and the actual outcome.

## Environment

- **Sandbox:** Windows PowerShell on a workstation with Node.js
  v24.14.1 and npm 11.11.0 installed via winget. Git is not
  installed (per the sandbox posture).
- **Date:** 2026-06-16
- **Project root:**
  `D:\pharos-future-ideas\04-multi-agent-job-router`

## Static Checks (executed in this sandbox)

The following static checks were executed in the sandbox via the
Node.js entry points in `tools/`:

| Check                      | Command                          | Result |
|----------------------------|----------------------------------|--------|
| Plan-preservation hash     | `node tools\check-protected.mjs` | PASS   |
| Workspace isolation        | `node tools\check-isolation.mjs` | PASS   |
| Secret scan                | `node tools\check-secrets.mjs`   | PASS   |
| Combined verify            | `node tools\verify.mjs`          | PASS   |

Output excerpts:

```
ok:README.md
ok:docs/superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md
protected file hash check passed

isolation check passed

secret scan passed

ok:isolation
ok:protected
ok:secrets
ok:typecheck
ok:test
ok:build
ok:contracts
---
summary:
isolation: OK
protected: OK
secrets: OK
typecheck: OK
test: OK
build: OK
contracts: OK
totals: passed=7 skipped=0 failed=0
```

## TypeScript Build (executed in this sandbox)

| Check          | Command              | Result   |
|----------------|----------------------|----------|
| Build (tsc -b) | `npx tsc -b`         | 0 errors |

## Vitest Suite (executed in this sandbox)

Command: `node node_modules/vitest/vitest.mjs run`

```
 Test Files  9 passed (9)
      Tests  73 passed (73)
   Duration  ~1.3s
```

| File                                                 | Tests | Result |
|------------------------------------------------------|-------|--------|
| `packages/policy/test/safety.test.ts`                | 11    | PASS   |
| `packages/sdk/test/sdk.test.ts`                      |  3    | PASS   |
| `apps/web/test/app.test.tsx`                         |  2    | PASS   |
| `packages/workflow/test/workflow.test.ts`            | 18    | PASS   |
| `packages/routing/test/routing.test.ts`              |  6    | PASS   |
| `services/verifier/test/verifier.test.ts`            |  8    | PASS   |
| `packages/registry/test/registry.test.ts`            |  6    | PASS   |
| `services/orchestrator/test/orchestrator.test.ts`    | 10    | PASS   |
| `apps/api/test/server.test.ts`                       |  9    | PASS   |
| **Vitest subtotal**                                  | **73**| **PASS** |

## Hardhat Smart-Contract Suite

Command: `node node_modules/hardhat/internal/cli/bootstrap.js
--config packages/contracts/hardhat.config.cjs test
packages/contracts/test/atlantic.test.ts
packages/contracts/test/registry.test.ts
packages/contracts/test/invariants.test.ts`

```
  contracts/atlantic
    ✔ enforces chain id 688689
    ✔ computes deterministic assignment and result roots
    ✔ publishes a stubbed assignment and receipt (130ms)

  JobRouterRegistry
    ✔ records assignment and finalizes receipt (400ms)
    ✔ returns the full receipt
    ✔ transfers ownership

  JobRouterRegistry invariants
    ✔ only owner can record or finalize
    ✔ finalizeReceipt reverts without recordAssignment
    ✔ cannot record after finalize
    ✔ fuzz: random owners cannot finalize


  10 passing (640ms)
```

| File                                          | Tests | Result |
|-----------------------------------------------|-------|--------|
| `packages/contracts/test/atlantic.test.ts`    |  3    | PASS   |
| `packages/contracts/test/registry.test.ts`    |  3    | PASS   |
| `packages/contracts/test/invariants.test.ts`  |  4    | PASS   |
| **Hardhat subtotal**                          | **10**| **PASS** |

| **Total (vitest + hardhat)**                  | **83**| **PASS** |

The Hardhat mocha loader now uses `tsx` (registered via
`NODE_OPTIONS=--import tsx` in `hardhat.config.cjs`), which
handles the ESM/CJS interop correctly under the current Node 20+
toolchain. The earlier "0 passing" limitation documented in
previous revisions of this file is resolved. See
`docs/implementation-decisions.md` for the full rationale.

## Manual Acceptance Scenarios (defined in master plan)

The following scenarios are defined in the master plan and are
exercised by both the vitest suite and the standalone Node.js
acceptance scripts in `scripts/atlantic-acceptance/`:

- **Scenario A:** Successful multi-agent job.
  - Vitest: `orchestrator.test.ts > executes a happy-path job in dependency order`.
  - Standalone: `bash scripts/atlantic-acceptance/scenario-a.sh`
    (`scenario-a.mjs`).
- **Scenario B:** Failed worker reassignment.
  - Vitest: `orchestrator.test.ts > retries a failing task and reassigns on persistent failure`.
  - Standalone: `bash scripts/atlantic-acceptance/scenario-b.sh`
    (`scenario-b.mjs`).
- **Scenario C:** Verifier disagreement.
  - Vitest: `orchestrator.test.ts > conflicting verifier verdicts are recorded as disagreement`.
  - Standalone: `bash scripts/atlantic-acceptance/scenario-c.sh`
    (`scenario-c.mjs`).
- **Scenario D:** Budget rejection.
  - Vitest: `orchestrator.test.ts > fails the task and propagates cancellation when budget overflows` and `workflow.test.ts > rejects budgets that exceed the job budget`.
  - Standalone: `bash scripts/atlantic-acceptance/scenario-d.sh`
    (`scenario-d.mjs`).
- **Scenario E:** Risky-target rejection.
  - Vitest: `orchestrator.test.ts > uses GoPlus for risky-target rejection`.
  - Standalone: `bash scripts/atlantic-acceptance/scenario-e.sh`
    (`scenario-e.mjs`).
- **Scenario F:** Final receipt verification.
  - Vitest: `api/server.test.ts > creates, approves, and executes a job end-to-end` asserts the on-chain `chainId` and the receipt roots.
  - On-chain: `bash scripts/atlantic-acceptance/scenario-f.sh` runs the live on-chain `on-chain-roundtrip.mjs` against the deployed `JobRouterRegistry`; the recorded roundtrip output in `docs/atlantic-acceptance-results.md` is the canonical pass evidence.
- **Scenario G:** Human approval gate.
  - Vitest: `orchestrator.test.ts > requires human approval for financial tasks`.
- **Contract scenarios:**
  - `registry.test.ts > records assignment and finalizes receipt`
    exercises the full owner-only write path.
  - `registry.test.ts > returns the full receipt`
    exercises the read view.
  - `registry.test.ts > transfers ownership`
    exercises the OpenZeppelin `Ownable.transferOwnership`.
  - `invariants.test.ts > finalizeReceipt reverts without recordAssignment`
    exercises the "no_assignment" require.
  - `invariants.test.ts > cannot record after finalize`
    exercises the "already_finalized" require.
  - `invariants.test.ts > fuzz: random owners cannot finalize`
    exercises the OZ v5 `OwnableUnauthorizedAccount` typed error
    over up to 7 random signers.
  - `atlantic.test.ts > enforces chain id 688689`
    exercises the constructor chain-id guard.
  - `atlantic.test.ts > computes deterministic assignment and result roots`
    exercises the keccak256-based root computation.
  - `atlantic.test.ts > publishes a stubbed assignment and receipt`
    exercises the viem client wrappers.

## Standalone Acceptance Scenarios (executed in this sandbox)

Each scenario in `scripts/atlantic-acceptance/scenario-{a..e}.sh`
is a thin wrapper that execs a sibling Node.js script which
exercises the implementation in-process (no API server, no live
blockchain). The scenarios exit 0 on success and non-zero on
failure, so they can be wired into a future CI gate.

| Script | Result | Notes |
|--------|--------|-------|
| `scenario-a.sh` | PASS | All three tasks end `VERIFIED`; `totalSpent == 3000`. |
| `scenario-b.sh` | PASS | Retries: t1 succeeds on attempt 3; persistent: t1 ends `FAILED`. |
| `scenario-c.sh` | PASS | Verifier disagrees on t3; t1/t2 are `VERIFIED`, t3 is `FAILED`. |
| `scenario-d.sh` | PASS | Compile throws `ValidationError(code: "budget_overflow")`; orchestrator marks every task `FAILED` with `totalSpent == 0`. |
| `scenario-e.sh` | PASS | GoPlus returns `verdict: "risky"` for the denylisted address; the end-to-end job aborts with `goplus_risky_target`. |
| `scenario-f.sh` | On-chain | Live on-chain roundtrip; pass evidence in `docs/atlantic-acceptance-results.md`. |

## Outstanding Items

- None for code: the local web demo runs end-to-end via
  `node scripts/demo.mjs`, the 6 acceptance scenarios A-F exit
  0 (A-E in-process, F on-chain), and `node tools/verify.mjs`
  passes 7/7. The on-chain scenario F is the only one that
  requires user-provided credentials (`ROUTER_DEPLOYER_PRIVATE_KEY`
  + PHRS funding) and is already recorded in
  `docs/atlantic-acceptance-results.md`.
- Optional follow-ups (none blocking acceptance):
  - Split the deployer address into separate
    `ROUTER_FEE_ADDRESS` / `VERIFIER_ADDRESS` / `OPERATOR_ADDRESS`
    wallets. Currently all three are the deployer address.
  - Deploy the API server (and optionally the dashboard) to
    Alibaba Cloud Function Compute. The local demo covers the
    full UX; the cloud deploy is an infrastructure step that
    does not change the code.
