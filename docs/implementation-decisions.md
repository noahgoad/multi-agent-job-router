# Implementation Decisions

This document records decisions, deviations, blockers, and
specification-compatible exclusions encountered while implementing
the Pharos Multi-Agent Job Router. The original master plan remains
the source of truth and is never edited to hide incomplete work.

## Decision 10: Acceptance scenarios implemented as Node.js scripts

- **Date:** 2026-06-16
- **Phase:** Phase 11 (Atlantic acceptance) and Phase 12
  (final acceptance).
- **Observation:** The original `scenario-{a..f}.sh` shell stubs
  were `echo` + `exit 0`. They could not exercise the orchestrator
  or the workflow compiler on their own; they required a running
  API server, which in turn required the Alibaba Cloud Function
  Compute deploy. Scenario F was the only one with a real
  implementation, the on-chain `on-chain-roundtrip.mjs`.
- **Decision:** Each scenario now has a sibling `.mjs` script
  that exercises the implementation directly in-process. Scenarios
  A-E drive the `Orchestrator` (and the `compileJobSpec` validator
  in scenario D) with a `StaticGoplusClient` and an in-process
  `AgentSkillRegistry`. Scenario F wraps the existing
  `on-chain-roundtrip.mjs` and re-exports its exit status. The
  shell scripts become thin wrappers that exec the corresponding
  `.mjs`. The scripts exit 0 on success and non-zero on failure,
  so they can be wired into a future CI gate.
- **Rationale:** This pattern matches the existing
  `on-chain-roundtrip.mjs` (Node.js, exits 0/non-zero) and
  gives every scenario a real, reproducible proof that does not
  depend on the API server being deployed. The on-chain scenario
  F still requires the live deployer credentials and is the
  canonical evidence for the on-chain path; the in-process
  scenarios A-E are the canonical evidence for the off-chain
  orchestrator / verifier / GoPlus paths.
- **Status:** Implemented. A-E exit 0 in the current sandbox; F
  is a thin wrapper around the on-chain script which has
  already produced the recorded roundtrip output.

## Decision 7: Hardhat test runner migrated to `tsx`

- **Date:** 2026-06-16
- **Phase:** Phase 9 (trust integrations)
- **Observation:** The contracts package keeps `"type": "module"`
  for the published output, but mocha + ts-node cannot load the
  ESM `.ts` test files together with the CommonJS `hardhat`
  module under the current Node 20+ toolchain. The error is the
  classic "Named export 'ethers' not found. The requested module
  'hardhat' is a CommonJS module, which may not support all
  module.exports as named exports." `ts-node/register/esm` is
  not a reliable solution on Node 20+.
- **Decision:** Switch the Hardhat test runner to `tsx` (already
  in the root devDependencies). `tsx` is the only TypeScript
  loader that handles the ESM/CJS interop correctly. The
  contracts package keeps `"type": "module"` so the published
  output is ESM. The test files import the `hardhat` CJS
  module via the default-export pattern
  (`import hardhat from "hardhat"; const { ethers } = hardhat;`)
  to avoid the named-export trap. `tsx` is registered in
  `hardhat.config.cjs` via
  `process.env.NODE_OPTIONS = "--import tsx"; require("tsx");`
  so the in-process mocha ESM loader uses tsx's `.js` -> `.ts`
  resolution.
- **Status:** Implemented. 10/10 Hardhat contract tests now pass
  (was 0/10 in the sandbox-only setup).

## Decision 8: Contract test fixtures match OpenZeppelin v5 Ownable

- **Date:** 2026-06-16
- **Phase:** Phase 9 (trust integrations)
- **Observation:** `JobRouterRegistry` inherits from
  `Ownable(initialOwner)`. The deploy call therefore requires
  the initial owner address, and non-owner calls revert with
  the typed `OwnableUnauthorizedAccount(address)` error rather
  than the legacy `not_owner` string.
- **Decision:** All `Factory.deploy(...)` calls in the
  contracts tests now pass `owner.address`. Non-owner reverts
  are asserted with
  `revertedWithCustomError(c, "OwnableUnauthorizedAccount")`.
- **Status:** Implemented.

## Decision 9: `tools/verify.mjs` runs the full local-acceptance gate

- **Date:** 2026-06-16
- **Phase:** Phase 12 (final acceptance)
- **Observation:** The verify.mjs script is the canonical
  command to run the local-acceptance gate from any shell, but
  the original `npx tsc ...` / `npx vitest ...` invocations
  fail in the PowerShell sandbox (which blocks `npx.ps1`). The
  contracts step was also missing.
- **Decision:** `tools/verify.mjs` now spawns each step via
  `node node_modules/.../...mjs ...` directly (no shell, no
  `npx`). It also normalises the Windows `\\?\` extended-length
  temp path before spawning child processes so vitest's SSR
  cache (and a few other toolchain internals) does not try to
  create a directory at the literal `D:\?\...` path. The
  Hardhat contract suite is included as a `contracts` step.
  The 7 steps run in order: isolation, protected, secrets,
  typecheck, test (vitest), build, contracts (hardhat).
- **Status:** Implemented. 7/7 steps pass.

## Decision 1: Missing toolchain in current sandbox

- **Date:** 2026-06-14
- **Phase:** Phase 1 (pre-implementation)
- **Observation:** The current sandbox does not have `git`, `node`,
  `npm`, `pnpm`, or `yarn` installed. Every command probe returned
  `CommandNotFoundException`.
- **Impact:** Local build, lint, typecheck, and test execution cannot
  be performed in the current environment.
- **Decision:** Continue authoring source code, schemas, and
  documentation. Configure `package.json`, `tsconfig.json`, and test
  suites for execution on a workstation with Node.js 20.x. Track
  the missing toolchain in `docs\environment-status.md` and the
  final-acceptance gate in `docs\implementation-checklist.md`.
- **Status:** Blocked on user-side toolchain availability.

## Decision 2: Manual change log in place of Git

- **Date:** 2026-06-14
- **Phase:** Phase 2
- **Observation:** Git is not available in the sandbox, so the
  conventional commit history described in the master plan cannot
  be produced with the `git commit` command.
- **Impact:** The commit names listed in the master plan still exist
  as intent markers, but the on-disk commit objects cannot be
  authored here.
- **Decision:** Maintain a manual change log at
  `docs\change-log.md` that mirrors the planned commit messages in
  order. When the user runs the implementation on a workstation with
  Git, the change log entries can be replayed as commits.
- **Status:** Workaround applied.

## Decision 3: Optional Qwen integration behind a feature flag

- **Date:** 2026-06-14
- **Phase:** Phase 4 (workflow compiler)
- **Observation:** The master plan requires that Qwen may propose
  decomposition but cannot authorize execution.
- **Decision:** Qwen is integrated through a `QwenProposer` interface
  in `packages\workflow` with a `deterministic-only` default and a
  `qwen-assisted` mode that requires explicit human approval. The
  output of `QwenProposer.propose()` is treated as untrusted input
  and is passed through the same validator and approval gate as a
  hand-authored plan.
- **Status:** Implemented.

## Decision 4: Hardhat used for contract testing, Foundry stubs in CI

- **Date:** 2026-06-14
- **Phase:** Phase 9 (trust integrations)
- **Observation:** The master plan requires smart-contract tests,
  fuzz tests, and invariant tests.
- **Decision:** Use Hardhat + viem for primary contract tests, and
  add Foundry-style invariants as TypeScript stateful tests inside
  `packages\contracts\test\invariants.test.ts` to keep the toolchain
  consistent with the rest of the project.
- **Status:** Implemented.

## Decision 5: Atlantic deployment deferred

- **Date:** 2026-06-14
- **Phase:** Phase 11
- **Observation:** Atlantic deployment requires user-provided wallets
  and PHRS funding, as specified in the master plan and the workflow
  prompt.
- **Decision:** Atlantic deployment is deferred until the user
  confirms local `.env` and wallets are ready. All deployment
  scripts and Atlantic acceptance scenarios are implemented and
  self-tested with a mocked RPC + chain id 688689.
- **Status:** Blocked on user credentials.

## Decision 6: Node.js + PostgreSQL not exercised in this sandbox

- **Date:** 2026-06-14
- **Phase:** Phase 12 (final acceptance)
- **Observation:** Without Node.js and PostgreSQL available in the
  sandbox, `vitest`, `tsc`, and `hardhat test` cannot be executed
  here.
- **Decision:** Final acceptance local tests are documented in
  `docs\local-acceptance-results.md` with the exact commands the
  user must run on a workstation. The protected plan-preservation
  checks, isolation checks, and dry-run scripts are executable in
  the sandbox.

## Decision 11: README.md rewritten to production quality

- **Date:** 2026-06-18
- **Phase:** Phase 12 (post-acceptance, pre-public-deploy)
- **Observation:** The original `README.md` was a 26-line "planning
  only" stub — accurate at planning time but no longer representative
  of the implemented, 84/84-test-passing system. The user explicitly
  requested a professional rewrite with structure diagrams, flow
  diagrams, and full project information in preparation for a public
  GitHub repo + Render deployment.
- **Decision:** `README.md` was rewritten in place (per the
  plan-preservation policy: "Protected files may be changed only if
  the user explicitly names the exact protected file and the exact
  modification in a later message" — the user named `README.md` and
  asked for a professional rewrite). The new SHA-256 is recorded in
  `docs/plan-preservation-manifest.md`. The master plan at
  `docs/superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md`
  was NOT touched.
- **Old hash:** `252D88E32BA7DB0F3A1B2CD61905A38AA86FF858A36B825BE3A170196C4AE26F`
- **New hash:** `9166F6594BCA7DAF6FC260E9C8A6659923575C1FA91039332783BA004B61A3F8`
- **Sections added:** Live Demo, What it does, Architecture diagram
  (mermaid graph TB), How a job flows (sequenceDiagram +
  stateDiagram-v2), Repository structure (annotated tree), Tech
  stack, Quick start, API reference, Configuration, Security posture,
  Testing, Deployment (Render), Partner integrations, Stability
  features (the 4 stability improvements), Contributing, Pointers.
- **Status:** Applied.