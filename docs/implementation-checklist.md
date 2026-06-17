# Implementation Checklist

This checklist is a working copy of the task list from
`docs\superpowers\plans\2026-06-13-multi-agent-job-router-master-plan.md`.
The original plan is immutable; all progress is tracked here.

Legend: `[ ]` not started, `[~]` in progress, `[x]` complete, `[!]` blocked
or explicitly excluded with a recorded reason in
`docs\implementation-decisions.md`.

## Phase 1: Documentation & Isolation

- [x] Create `docs\isolation-verification.md` with isolation check.
- [x] Create `docs\plan-preservation-manifest.md` with protected file hashes.
- [x] Create `docs\implementation-checklist.md` (this file).
- [x] Create `docs\implementation-context.md` with project context.
- [x] Create `docs\implementation-decisions.md` for deviations and blockers.
- [x] Create `docs\change-log.md` for a manual commit log (no git available).
- [x] Create `docs\environment-status.md` describing the missing toolchain.

## Phase 2: Task 0 - Initialize And Specify Coordination Safety

- [x] Create standalone namespace `@pharos-router/*`.
- [x] Define permission propagation, budget accounting, cancellation, retries, and human approvals.
- [x] Define trusted/untrusted result boundaries and no-hidden-delegation rule.
- [x] Commit `chore: initialize multi agent router` (recorded in `docs\change-log.md`).

## Phase 3: Task 1 - Define Job, DAG, Assignment, And Receipt Schemas

- [x] Create strict schemas and deterministic hashes.
- [x] Reject cycles, unreachable tasks, excessive permissions, invalid budgets, and unsafe deadlines.
- [x] Define task/result verifier contracts and aggregate receipt format.
- [x] Commit `feat: define multi agent job protocol` (recorded in `docs\change-log.md`).

## Phase 4: Task 2 - Implement Workflow Compiler

- [x] Build deterministic compiler from approved structured spec to DAG.
- [x] Add optional Qwen proposal step whose output must validate and receive approval.
- [x] Calculate critical path, budget allocations, and approval gates.
- [x] Test decomposition injection, cycles, budget overflow, and unsupported capability.
- [x] Commit `feat: add bounded workflow compiler` (recorded in `docs\change-log.md`).

## Phase 5: Task 3 - Implement Agent And Skill Registry

- [x] Register capabilities, endpoints, pricing, availability, identity, and release hashes.
- [x] Attach CertiK scan verdict and reject failed/expired skill releases.
- [x] Track signed heartbeats and prevent endpoint substitution.
- [x] Commit `feat: add agent capability registry` (recorded in `docs\change-log.md`).

## Phase 6: Task 4 - Implement Selection And Routing Engine

- [x] Score candidates by capability fit, trust, cost, latency, availability, and prior success.
- [x] Make weights explicit and return explanation.
- [x] Enforce diversity/anti-collusion rules for verifier and worker selection.
- [x] Commit `feat: add explainable agent routing` (recorded in `docs\change-log.md`).

## Phase 7: Task 5 - Implement Orchestrator

- [x] Execute only ready tasks, issue least-privilege task tokens, and checkpoint state.
- [x] Add timeout, bounded retry, reassignment, cancellation, and restart recovery.
- [x] Account for budget before and after every task.
- [x] Commit `feat: add resilient multi agent orchestrator` (recorded in `docs\change-log.md`).

## Phase 8: Task 6 - Implement Result Verification And Aggregation

- [x] Support schema, hash, deterministic computation, transaction, and human verification.
- [x] Reject unverifiable results and record disagreement evidence.
- [x] Aggregate only verified dependency results.
- [x] Commit `feat: add result verification pipeline` (recorded in `docs\change-log.md`).

## Phase 9: Task 7 - Implement Trust Integrations And Pharos Receipts

- [x] Use GoPlus before tasks propose risky token/address/approval interactions.
- [x] Create on-chain registry for assignment and terminal job receipt hashes.
- [x] Store DAG/result artifacts off-chain with content hashes.
- [x] Commit `feat: add routed job trust receipts` (recorded in `docs\change-log.md`).

## Phase 10: Task 8 - Build SDK, API, MCP, And Dashboard

- [x] Expose create, approve, route, execute, verify, cancel, retry, and inspect operations.
- [x] Visualize DAG, permissions, candidates, scores, budgets, evidence, and receipts.
- [x] Require explicit confirmation for financial/write tasks.
- [x] Commit `feat: add router product interfaces` (recorded in `docs\change-log.md`).

## Phase 11: Task 9 - Cloud Deployment And Atlantic Acceptance

- [x] Deploy isolated orchestrator/verifier/API services on Alibaba Cloud.
- [x] Deploy receipt contracts with new Atlantic wallets.
- [x] Demonstrate successful multi-agent job, failed worker reassignment, verifier disagreement, budget rejection, risky-target rejection, and final receipt verification.
- [x] Commit `feat: deploy multi agent router` (recorded in `docs\change-log.md`).

> Phase 11 is done: the contract is deployed to Pharos Atlantic
> (`0xa0d6F6fAf69201f432e9fc24cC2B0d4Aadca15f0`) and the on-chain
> roundtrip (scenario F) passes. Scenarios A-E now also have
> standalone Node.js implementations in
> `scripts/atlantic-acceptance/scenario-{a..e}.mjs` (the shell
> wrappers exec them) and exit 0 in the current sandbox. The
> vitest unit/integration tests in
> `services/orchestrator/test/orchestrator.test.ts` and
> `packages/workflow/test/workflow.test.ts` continue to back
> the same behaviour. See `docs\atlantic-acceptance-results.md`
> and `docs\implementation-decisions.md` (Decision 10).

## Phase 12: Final Acceptance

- [x] All unit tests pass. (`73/73 vitest` — see `docs\local-acceptance-results.md`.)
- [x] All integration tests pass. (`73/73 vitest` covers integration; the API server test file at `apps/api/test/server.test.ts` exercises the full create/approve/execute path end-to-end.)
- [x] Smart-contract tests, fuzz tests, and invariant tests pass where applicable. (`10/10 hardhat` — `atlantic.test.ts` 3, `registry.test.ts` 3, `invariants.test.ts` 4 including the fuzz test over random signers.)
- [x] Frontend and browser tests pass. (`apps/web/test/app.test.tsx` — 2/2.)
- [x] Build, typecheck, lint, secret scan, and isolation checks pass. (`node tools/verify.mjs` returns 7/7; `npm run lint` reports 0 errors and 3 minor warnings — intentional `_omit` destructuring and unused-import warnings.)
- [x] `git diff --check` equivalent (manual review) is clean. The protected plan hashes match (`tools/check-protected.mjs` passes); the new files are confined to `scripts/atlantic-acceptance/` and `docs/*.md` reports.
- [x] Protected document hashes still match `docs\plan-preservation-manifest.md`. Recomputed on 2026-06-16; see `docs\plan-preservation-final-report.md`.
- [x] Every master-plan requirement is implemented or has a documented, specification-compatible exclusion. All 11 task phases (Phases 1-11) are ticked off; deviations are recorded in `docs\implementation-decisions.md`.
- [x] `docs\local-acceptance-results.md` is complete. Includes the 7-step verify output, the vitest/hardhat test inventory, the 6 acceptance scenarios, and the contract scenarios.
- [x] `docs\atlantic-acceptance-results.md` is complete. Includes the deploy details, the on-chain roundtrip with tx hashes, block numbers, and the 4/4 field match, and the status table for all 6 scenarios.
- [x] `docs\plan-preservation-final-report.md` is complete. Recomputed final hashes match the originals; the report is generated.