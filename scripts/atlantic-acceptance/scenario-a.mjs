// Scenario A: Successful multi-agent job
//
// Run a 3-task job end-to-end through the `Orchestrator`. The worker
// and verifier always succeed, so every task must end in `VERIFIED`
// and `totalSpent` must match the per-task cost.

import { ArtifactStore } from "@pharos-router/workflow";
import {
  buildHappyJob,
  buildRegistry,
  makeAlwaysOkWorker,
  Orchestrator,
} from "./_shared.mjs";

async function main() {
  console.log("=== Scenario A: successful multi-agent job ===");
  const { registry } = buildRegistry();
  const spec = buildHappyJob();
  const calls = [];
  const hooks = {
    worker: async (taskId) => {
      calls.push(taskId);
      return {
        taskId,
        agentId: "agent-1",
        outputHash: ("0x" + "11".repeat(32)),
        output: { costMicrousd: 1_000n, ok: true },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      };
    },
    verifier: async () => ({ ok: true, reason: "ok" }),
  };
  void makeAlwaysOkWorker;
  const orchestrator = new Orchestrator(spec, hooks, {
    now: () => 1,
    registry,
    artifact: new ArtifactStore(),
    declaredAgents: ["agent-1"],
  });
  const r = await orchestrator.run();
  const order = JSON.stringify(calls);
  const expectedOrder = JSON.stringify(["t1", "t2", "t3"]);
  const allVerified =
    r.states.t1 === "VERIFIED" &&
    r.states.t2 === "VERIFIED" &&
    r.states.t3 === "VERIFIED";
  const spentOk = r.totalSpent === 3_000n;
  console.log("execution order   :", order, order === expectedOrder ? "OK" : "MISMATCH");
  console.log("states            :", JSON.stringify(r.states));
  console.log("all verified      :", allVerified ? "OK" : "MISMATCH");
  console.log("totalSpent        :", r.totalSpent.toString(), spentOk ? "OK" : "MISMATCH");
  console.log("results count     :", r.results.length, r.results.length === 3 ? "OK" : "MISMATCH");
  if (!allVerified || !spentOk || order !== expectedOrder || r.results.length !== 3) {
    console.error("Scenario A FAILED");
    process.exit(1);
  }
  console.log("Scenario A OK.");
}

main().catch((err) => {
  console.error("Scenario A threw:", err);
  process.exit(1);
});
