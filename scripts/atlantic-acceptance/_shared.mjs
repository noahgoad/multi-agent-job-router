// Shared helper for the local-acceptance scenarios A-E.
//
// Each scenario builds an in-process `AgentSkillRegistry`, registers a
// trusted skill release and a heartbeat-bearing agent, and then runs
// the `Orchestrator` with scenario-specific hooks. The helper is
// imported from the compiled workspace bundles in
// `node_modules/@pharos-router/*` so the script can be executed with
// plain `node` (no TS loader required).
//
// The scenarios assert expected task states and budgets; each script
// exits with code 0 on success and non-zero on failure. The output is
// plain text so the result can be parsed from a shell wrapper.

import { contentHash, hashString } from "@pharos-router/workflow";
import { AgentSkillRegistry } from "@pharos-router/registry";
import {
  Orchestrator,
  StaticGoplusClient,
} from "@pharos-router/orchestrator";

/**
 * Build a fresh registry with a single trusted skill release, a
 * single agent, and a recent heartbeat. The agent advertises the
 * full set of capabilities used by the acceptance scenarios so the
 * orchestrator never has to fall back to "no eligible agent".
 */
export function buildRegistry({ now = 1 } = {}) {
  const registry = new AgentSkillRegistry();
  const skill = {
    skillId: "summarize",
    version: "1.0.0",
    releaseHash: ("0x" + "00".repeat(32)),
    imageDigest: "sha256:abc",
    publishedAt: 0,
    expiresAt: 9_999_999_999,
    capabilities: [
      "fetch",
      "analyze",
      "summarize",
      "verify",
      "financial",
      "write",
      "read",
      "compute",
    ],
    certikVerdict: "pass",
    certikVerdictAt: 0,
    certikReportUrl: "https://certik.example/1",
  };
  const { releaseHash: _omit, ...body } = skill;
  skill.releaseHash = contentHash(body);
  registry.registerSkill(skill);
  registry.registerAgent({
    agentId: "agent-1",
    displayName: "A1",
    endpoint: "https://a1.example",
    pricingMicrousd: 1_000n,
    trustScore: 90,
    capabilities: [
      "fetch",
      "analyze",
      "summarize",
      "verify",
      "financial",
      "write",
      "read",
      "compute",
    ],
    activeSkillRelease: skill.releaseHash,
    lastHeartbeat: 0,
    registeredAt: 0,
  });
  registry.recordHeartbeat({
    agentId: "agent-1",
    endpoint: "https://a1.example",
    issuedAt: now,
    nonce: "abcd1234",
    signature: hashString("sig"),
  });
  return { registry, skill, agentId: "agent-1" };
}

/**
 * Standard 3-task job used by scenarios A-C. The job has 1 000 000
 * microusd of budget; the per-task budget (100 000 + 200 000 + 200
 * 000) fits comfortably.
 */
export function buildHappyJob(extra = {}) {
  return {
    jobId: "job-acceptance",
    goal: "summarize",
    goalHash: hashString("goal"),
    budgetMicrousd: 1_000_000n,
    deadline: 9_999_999_999,
    allowedCapabilities: [
      "fetch",
      "analyze",
      "summarize",
      "verify",
      "financial",
      "write",
      "read",
      "compute",
    ],
    policyHash: hashString("policy"),
    verifier: "verifier-default",
    tasks: [
      {
        taskId: "t1",
        description: "fetch",
        dependencies: [],
        capability: "fetch",
        inputHash: hashString("t1"),
        budgetMicrousd: 100_000n,
        deadline: 9_000_000_000,
        verifier: "verifier-default",
        verifierKind: "hash",
      },
      {
        taskId: "t2",
        description: "analyze",
        dependencies: ["t1"],
        capability: "analyze",
        inputHash: hashString("t2"),
        budgetMicrousd: 200_000n,
        deadline: 9_500_000_000,
        verifier: "verifier-default",
        verifierKind: "deterministic",
      },
      {
        taskId: "t3",
        description: "summarize",
        dependencies: ["t2"],
        capability: "summarize",
        inputHash: hashString("t3"),
        budgetMicrousd: 200_000n,
        deadline: 9_900_000_000,
        verifier: "verifier-default",
        verifierKind: "schema",
      },
    ],
    ...extra,
  };
}

/**
 * Build a single worker hook that always succeeds, returning a
 * `TaskResult` with the cost taken from the worker's `output`.
 */
export function makeAlwaysOkWorker({ cost = 1_000n } = {}) {
  return async (taskId) => ({
    taskId,
    agentId: "agent-1",
    outputHash: hashString(taskId),
    output: { costMicrousd: cost, ok: true },
    submittedAt: 1,
    verifierKind: "hash",
    verifierNote: "",
  });
}

export { Orchestrator, StaticGoplusClient };
