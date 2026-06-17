# Atlantic Acceptance Scenarios

The router must successfully execute the following scenarios on
Pharos Atlantic (chain id 688689) before the project is considered
deployment-complete.

## Scenario A: Successful multi-agent job

- Submit a 3-task `JobSpec` (fetch -> analyze -> summarize) with a
  generous budget.
- Approve the job.
- Execute the job.
- Assert: all tasks reach `VERIFIED`, the receipt is anchored on
  `JobRouterRegistry`, and the on-chain `getReceipt` matches the
  off-chain DAG, result, and verification roots.

## Scenario B: Failed worker reassignment

- Configure the worker for `t1` to throw on the first call and
  succeed on the second.
- Execute the job.
- Assert: `t1` is retried, the retry uses a fresh token, and the
  orchestrator eventually records a `VERIFIED` state for `t1`.
- Assert: the budget is settled correctly (reserved -> actual).

## Scenario C: Verifier disagreement

- Configure the verifier for `t2` to return `{ ok: false, reason:
  "disagreement" }`.
- Execute the job.
- Assert: `t2` is recorded as `FAILED`, the disagreement
  `VerificationRecord` is persisted, and the aggregator excludes
  the task from the result root.

## Scenario D: Budget rejection

- Submit a job whose task budgets sum to more than the job budget.
- Assert: the API rejects the job at the create step with
  `budget_overflow` and no DAG is compiled.

## Scenario E: Risky-target rejection (GoPlus)

- Submit a job whose `financial` task targets a denylisted address.
- Assert: the orchestrator's GoPlus pre-flight returns
  `verdict: "risky"` and the task is cancelled; the receipt still
  records the cancelled task with a reason code.

## Scenario F: Final receipt verification

- After a successful execution, query the on-chain
  `getReceipt(jobId)` and compare the returned roots with the
  locally computed roots.
- Assert: `dagHash`, `resultRoot`, and `verificationRoot` all match
  the local computation, and `isFinalized` is `true`.

## How to Run

From the project root on a workstation with the required toolchain
(Node.js 20.x, Foundry/Hardhat, jq, curl):

```bash
# 1. Deploy contracts to Atlantic
npm run deploy:atlantic

# 2. Start the API
npm run dev:api

# 3. Run each scenario (see scripts/atlantic-acceptance/*.sh)
bash scripts/atlantic-acceptance/scenario-a.sh
bash scripts/atlantic-acceptance/scenario-b.sh
bash scripts/atlantic-acceptance/scenario-c.sh
bash scripts/atlantic-acceptance/scenario-d.sh
bash scripts/atlantic-acceptance/scenario-e.sh
bash scripts/atlantic-acceptance/scenario-f.sh
```

Each script writes a sanitized manifest to
`docs/atlantic-acceptance-results.md`.