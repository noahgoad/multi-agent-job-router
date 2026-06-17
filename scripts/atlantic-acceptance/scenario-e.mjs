// Scenario E: Risky-target rejection.
//
// Any task that proposes a transaction target is gated on a GoPlus
// scan. This scenario exercises the `StaticGoplusClient` with a
// denylist and asserts that a denylisted address returns a
// `verdict: "risky"` response, and that a non-denylisted address
// returns `verdict: "safe"`. The orchestrator does not invoke the
// goplus hook itself; the check is performed at the worker side
// before the task is submitted on-chain. The scenario also runs an
// end-to-end job whose worker uses the goplus verdict to abort a
// financial task with the reason "address_on_denylist".

import { ArtifactStore, hashString } from "@pharos-router/workflow";
import {
  buildHappyJob,
  buildRegistry,
  Orchestrator,
  StaticGoplusClient,
} from "./_shared.mjs";

const RISKY = "0x0000000000000000000000000000000000000bad";
const SAFE = "0x0000000000000000000000000000000000000abc";
const CHAIN_ID = 688689;

async function goplusUnit() {
  console.log("=== Scenario E: risky-target rejection (GoPlus) ===");
  const client = new StaticGoplusClient([RISKY]);
  const risky = await client.checkAddress(CHAIN_ID, RISKY);
  const safe = await client.checkAddress(CHAIN_ID, SAFE);
  console.log(
    "risky address     :",
    risky.verdict,
    risky.verdict === "risky" ? "OK" : "MISMATCH"
  );
  console.log(
    "safe address      :",
    safe.verdict,
    safe.verdict === "safe" ? "OK" : "MISMATCH"
  );
  if (risky.verdict !== "risky" || safe.verdict !== "safe") {
    console.error("Scenario E (goplus) FAILED");
    process.exit(1);
  }
  console.log("Scenario E (goplus) OK.");
}

async function orchestratorAbort() {
  console.log();
  console.log(
    "=== Scenario E: risky-target rejection (orchestrator abort) ==="
  );
  const { registry } = buildRegistry();
  const spec = buildHappyJob();
  // Replace t2 with a financial task that targets the risky address.
  spec.tasks[1] = {
    taskId: "t2",
    description: "transfer",
    dependencies: ["t1"],
    capability: "financial",
    inputHash: hashString("t2"),
    budgetMicrousd: 200_000n,
    deadline: 9_500_000_000,
    verifier: "verifier-default",
    verifierKind: "schema",
  };
  const client = new StaticGoplusClient([RISKY]);
  const hooks = {
    worker: async (taskId, _token, _attempt) => {
      if (taskId === "t2") {
        const v = await client.checkAddress(CHAIN_ID, RISKY);
        if (v.verdict === "risky") {
          throw new Error(`goplus_risky_target:${v.reason}`);
        }
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
    retry: { maxAttempts: 1, backoffSeconds: 0, requireFreshToken: true },
  });
  const r = await orchestrator.run();
  const t1Verified = r.states.t1 === "VERIFIED";
  const t2Failed = r.states.t2 === "FAILED";
  // t3 depends on t2; t2 is not in the completed set, so t3 is
  // never picked up by the orchestrator and stays in PLANNED.
  const t3Planned = r.states.t3 === "PLANNED";
  console.log(
    "t1 state          :",
    r.states.t1,
    t1Verified ? "OK" : "MISMATCH"
  );
  console.log("t2 state          :", r.states.t2, t2Failed ? "OK" : "MISMATCH");
  console.log(
    "t3 state          :",
    r.states.t3,
    t3Planned ? "OK" : "MISMATCH"
  );
  if (!t1Verified || !t2Failed || !t3Planned) {
    console.error("Scenario E (orchestrator) FAILED");
    process.exit(1);
  }
  console.log("Scenario E (orchestrator) OK.");
}

(async () => {
  await goplusUnit();
  await orchestratorAbort();
  console.log();
  console.log("Scenario E OK.");
})().catch((err) => {
  console.error("Scenario E threw:", err);
  process.exit(1);
});
