// Scenario C: Verifier disagreement.
//
// The verifier returns `ok = false` for t3, which must move the task
// to `FAILED`. t1 and t2 must still end in `VERIFIED`. This matches
// the "conflicting verifier verdicts are recorded as disagreement"
// path in `services/orchestrator/test/orchestrator.test.ts`: the
// disagreement is recorded per-task and the orchestrator proceeds
// rather than aborting the whole job.

import { ArtifactStore, hashString } from "@pharos-router/workflow";
import { buildHappyJob, buildRegistry, Orchestrator } from "./_shared.mjs";

async function main() {
  console.log("=== Scenario C: verifier disagreement ===");
  const { registry } = buildRegistry();
  const spec = buildHappyJob();
  const verdicts = { t1: true, t2: true, t3: false };
  const calls = [];
  const hooks = {
    worker: async (taskId) => {
      calls.push(taskId);
      return {
        taskId,
        agentId: "agent-1",
        outputHash: hashString(taskId),
        output: { costMicrousd: 1_000n, ok: true },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      };
    },
    verifier: async (result) => ({
      ok: verdicts[result.taskId] ?? false,
      reason: verdicts[result.taskId] ? "ok" : "verifier_disagreement",
    }),
  };
  const orchestrator = new Orchestrator(spec, hooks, {
    now: () => 1,
    registry,
    artifact: new ArtifactStore(),
    declaredAgents: ["agent-1"],
  });
  const r = await orchestrator.run();
  const t1Verified = r.states.t1 === "VERIFIED";
  const t2Verified = r.states.t2 === "VERIFIED";
  const t3Failed = r.states.t3 === "FAILED";
  const t3ResultAbsent = !r.results.some((rr) => rr.taskId === "t3");
  // t3 is retried up to `maxAttempts` times because the verifier
  // returns false on every attempt. The orchestrator must still
  // run t1 and t2 exactly once, and must attempt t3 at least once.
  const t1CalledOnce = calls.filter((id) => id === "t1").length === 1;
  const t2CalledOnce = calls.filter((id) => id === "t2").length === 1;
  const t3Attempted = calls.filter((id) => id === "t3").length >= 1;
  const allAttempted = t1CalledOnce && t2CalledOnce && t3Attempted;
  console.log(
    "worker invocations:",
    JSON.stringify(calls),
    allAttempted ? "OK" : "MISMATCH"
  );
  console.log(
    "t1 state          :",
    r.states.t1,
    t1Verified ? "OK" : "MISMATCH"
  );
  console.log(
    "t2 state          :",
    r.states.t2,
    t2Verified ? "OK" : "MISMATCH"
  );
  console.log("t3 state          :", r.states.t3, t3Failed ? "OK" : "MISMATCH");
  console.log(
    "t3 result absent  :",
    t3ResultAbsent,
    t3ResultAbsent ? "OK" : "MISMATCH"
  );
  if (
    !t1Verified ||
    !t2Verified ||
    !t3Failed ||
    !t3ResultAbsent ||
    !allAttempted
  ) {
    console.error("Scenario C FAILED");
    process.exit(1);
  }
  console.log("Scenario C OK.");
}

main().catch((err) => {
  console.error("Scenario C threw:", err);
  process.exit(1);
});
