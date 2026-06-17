// Scenario B: Failed worker reassignment.
//
// The first two worker attempts throw a transient error; the third
// attempt succeeds. The orchestrator must retry with a fresh token,
// log at least one failure checkpoint, and finish the job in
// `VERIFIED`. The test also exercises the persistent-failure path:
// t2 is configured so its worker throws forever, and the task must
// end in `FAILED`.

import { ArtifactStore, hashString } from "@pharos-router/workflow";
import {
  buildHappyJob,
  buildRegistry,
  Orchestrator,
} from "./_shared.mjs";

async function happyPath() {
  console.log("=== Scenario B: failed worker reassignment (retries) ===");
  const { registry } = buildRegistry();
  const spec = buildHappyJob();
  const calls = new Map();
  const hooks = {
    worker: async (taskId) => {
      const n = (calls.get(taskId) ?? 0) + 1;
      calls.set(taskId, n);
      if (taskId === "t1" && n < 3) {
        throw new Error("transient_worker_error");
      }
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
    verifier: async () => ({ ok: true, reason: "ok" }),
  };
  const orchestrator = new Orchestrator(spec, hooks, {
    now: () => 1,
    registry,
    artifact: new ArtifactStore(),
    declaredAgents: ["agent-1"],
    retry: { maxAttempts: 3, backoffSeconds: 0, requireFreshToken: true },
  });
  const r = await orchestrator.run();
  const t1Attempts = calls.get("t1") ?? 0;
  const t1Verified = r.states.t1 === "VERIFIED";
  const t2Verified = r.states.t2 === "VERIFIED";
  const t3Verified = r.states.t3 === "VERIFIED";
  const t1AttemptsOk = t1Attempts === 3;
  console.log("t1 attempts       :", t1Attempts, t1AttemptsOk ? "OK" : "MISMATCH");
  console.log("t1 state          :", r.states.t1, t1Verified ? "OK" : "MISMATCH");
  console.log("t2 state          :", r.states.t2, t2Verified ? "OK" : "MISMATCH");
  console.log("t3 state          :", r.states.t3, t3Verified ? "OK" : "MISMATCH");
  console.log("checkpoints       :", r.checkpoints.length);
  if (!t1AttemptsOk || !t1Verified || !t2Verified || !t3Verified) {
    console.error("Scenario B (retries) FAILED");
    process.exit(1);
  }
  console.log("Scenario B (retries) OK.");
}

async function persistentFailure() {
  console.log();
  console.log("=== Scenario B: failed worker reassignment (persistent failure) ===");
  const { registry } = buildRegistry();
  const spec = buildHappyJob();
  const hooks = {
    worker: async () => {
      throw new Error("worker_always_fails");
    },
    verifier: async () => ({ ok: true, reason: "ok" }),
  };
  const orchestrator = new Orchestrator(spec, hooks, {
    now: () => 1,
    registry,
    artifact: new ArtifactStore(),
    declaredAgents: ["agent-1"],
    retry: { maxAttempts: 3, backoffSeconds: 0, requireFreshToken: true },
  });
  const r = await orchestrator.run();
  const t1Failed = r.states.t1 === "FAILED";
  const noResults = r.results.length === 0;
  console.log("t1 state          :", r.states.t1, t1Failed ? "OK" : "MISMATCH");
  console.log("results count     :", r.results.length, noResults ? "OK" : "MISMATCH");
  if (!t1Failed || !noResults) {
    console.error("Scenario B (persistent) FAILED");
    process.exit(1);
  }
  console.log("Scenario B (persistent) OK.");
}

(async () => {
  await happyPath();
  await persistentFailure();
  console.log();
  console.log("Scenario B OK.");
})().catch((err) => {
  console.error("Scenario B threw:", err);
  process.exit(1);
});
