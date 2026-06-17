// Scenario D: Budget rejection.
//
// The workflow compiler enforces a per-task and per-job budget:
// task budgets cannot exceed the job budget, and the sum of the
// task budgets cannot exceed the job budget. A spec that violates
// either rule is rejected at compile time, and the orchestrator
// catches the failure and marks every task as FAILED.
//
// This scenario exercises the compile-time rejection in two ways:
//   1. Calling `compileJobSpec` directly with a spec that overflows
//      the job budget. The compiler must throw a `ValidationError`
//      with `code: "budget_overflow"`.
//   2. Running the orchestrator with a spec that overflows the job
//      budget. The orchestrator must mark every task as FAILED and
//      return a `totalSpent` of 0.

import {
  ArtifactStore,
  compileJobSpec,
  hashString,
  ValidationError,
} from "@pharos-router/workflow";
import { buildHappyJob, buildRegistry, Orchestrator } from "./_shared.mjs";

async function compilerRejection() {
  console.log("=== Scenario D: budget rejection (compiler) ===");
  // 300 000 is larger than any single task budget (200 000) but
  // smaller than the sum (500 000), so the compiler throws
  // `budget_overflow` rather than `excessive_budget`.
  const spec = buildHappyJob({ budgetMicrousd: 300_000n });
  let err = null;
  try {
    compileJobSpec(spec, { now: 1 });
  } catch (e) {
    err = e;
  }
  const isValidationError = err instanceof ValidationError;
  const isBudgetOverflow = isValidationError && err.code === "budget_overflow";
  console.log(
    "compile-time error:",
    err ? err.constructor.name : "none",
    isValidationError ? "OK" : "MISMATCH"
  );
  console.log(
    "error code        :",
    err && isValidationError ? err.code : "n/a",
    isBudgetOverflow ? "OK" : "MISMATCH"
  );
  if (!isValidationError || !isBudgetOverflow) {
    console.error("Scenario D (compiler) FAILED");
    process.exit(1);
  }
  console.log("Scenario D (compiler) OK.");
}

async function orchestratorRejection() {
  console.log();
  console.log("=== Scenario D: budget rejection (orchestrator) ===");
  const { registry } = buildRegistry();
  // 300 000 is larger than any single task budget (200 000) but
  // smaller than the sum (500 000), so the compiler rejects the
  // spec and every task is marked FAILED by the orchestrator.
  const spec = buildHappyJob({ budgetMicrousd: 300_000n });
  const calls = [];
  const hooks = {
    worker: async (taskId) => {
      calls.push(taskId);
      return {
        taskId,
        agentId: "agent-1",
        outputHash: hashString(taskId),
        output: { costMicrousd: 1n, ok: true },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      };
    },
    verifier: async () => ({ ok: true, reason: "ok" }),
  };
  const orchestrator = new Orchestrator(spec, hooks, {
    now: () => 1,
    registry,
    artifact: new ArtifactStore(),
    declaredAgents: ["agent-1"],
  });
  const r = await orchestrator.run();
  const allFailed =
    r.states.t1 === "FAILED" &&
    r.states.t2 === "FAILED" &&
    r.states.t3 === "FAILED";
  const noSpent = r.totalSpent === 0n;
  const noResults = r.results.length === 0;
  const noCalls = calls.length === 0;
  console.log(
    "t1 state          :",
    r.states.t1,
    r.states.t1 === "FAILED" ? "OK" : "MISMATCH"
  );
  console.log(
    "t2 state          :",
    r.states.t2,
    r.states.t2 === "FAILED" ? "OK" : "MISMATCH"
  );
  console.log(
    "t3 state          :",
    r.states.t3,
    r.states.t3 === "FAILED" ? "OK" : "MISMATCH"
  );
  console.log(
    "totalSpent        :",
    r.totalSpent.toString(),
    noSpent ? "OK" : "MISMATCH"
  );
  console.log("worker invocations:", calls.length, noCalls ? "OK" : "MISMATCH");
  if (!allFailed || !noSpent || !noResults || !noCalls) {
    console.error("Scenario D (orchestrator) FAILED");
    process.exit(1);
  }
  console.log("Scenario D (orchestrator) OK.");
}

(async () => {
  await compilerRejection();
  await orchestratorRejection();
  console.log();
  console.log("Scenario D OK.");
})().catch((err) => {
  console.error("Scenario D threw:", err);
  process.exit(1);
});
