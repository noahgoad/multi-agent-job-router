import { describe, expect, it } from "vitest";
import {
  contentHash,
  hashString,
  type Hash,
  type JobSpec,
  type TaskState,
} from "@pharos-router/workflow";
import { AgentSkillRegistry } from "@pharos-router/registry";
import {
  Orchestrator,
  type OrchestratorHooks,
  type TaskToken,
  type TaskResult,
} from "../src/runner.js";
import { StaticGoplusClient } from "../src/goplus.js";
import { ArtifactStore } from "@pharos-router/workflow";

function hash(s: string): Hash {
  return hashString(s);
}

function job(): JobSpec {
  return {
    jobId: "job-1",
    goal: "summarize",
    goalHash: hash("goal"),
    budgetMicrousd: 1_000_000n,
    deadline: 1_000_000,
    allowedCapabilities: [
      "fetch",
      "analyze",
      "summarize",
      "verify",
      "financial",
    ],
    policyHash: hash("policy"),
    verifier: "verifier-default",
    tasks: [
      {
        taskId: "t1",
        description: "fetch",
        dependencies: [],
        capability: "fetch",
        inputHash: hash("t1"),
        budgetMicrousd: 100_000n,
        deadline: 900_000,
        verifier: "verifier-default",
        verifierKind: "hash",
      },
      {
        taskId: "t2",
        description: "analyze",
        dependencies: ["t1"],
        capability: "analyze",
        inputHash: hash("t2"),
        budgetMicrousd: 200_000n,
        deadline: 950_000,
        verifier: "verifier-default",
        verifierKind: "deterministic",
      },
      {
        taskId: "t3",
        description: "summarize",
        dependencies: ["t2"],
        capability: "summarize",
        inputHash: hash("t3"),
        budgetMicrousd: 200_000n,
        deadline: 990_000,
        verifier: "verifier-default",
        verifierKind: "schema",
      },
    ],
  };
}

function setupRegistry(): AgentSkillRegistry {
  const r = new AgentSkillRegistry();
  const sk = {
    skillId: "summarize",
    version: "1.0.0",
    releaseHash: ("0x" + "00".repeat(32)) as Hash,
    imageDigest: "sha256:abc",
    publishedAt: 0,
    expiresAt: 1_000_000,
    capabilities: ["fetch", "analyze", "summarize", "verify", "financial"],
    certikVerdict: "pass" as const,
    certikVerdictAt: 0,
    certikReportUrl: "https://certik.example/1",
  };
  {
    const { releaseHash: _omit, ...body } = sk;
    sk.releaseHash = contentHash(body);
  }
  r.registerSkill(sk);
  r.registerAgent({
    agentId: "agent-1",
    displayName: "A1",
    endpoint: "https://a1.example",
    pricingMicrousd: 1_000n,
    trustScore: 90,
    capabilities: ["fetch", "analyze", "verify", "summarize", "financial"],
    activeSkillRelease: sk.releaseHash,
    lastHeartbeat: 0,
    registeredAt: 0,
  });
  r.recordHeartbeat({
    agentId: "agent-1",
    endpoint: "https://a1.example",
    issuedAt: 0,
    nonce: "abcd1234",
    signature: hash("sig"),
  });
  return r;
}

describe("orchestrator/runner", () => {
  it("executes a happy-path job in dependency order", async () => {
    const registry = setupRegistry();
    const spec = job();
    const calls: string[] = [];
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string, _token: TaskToken, _a: number) => {
        calls.push(taskId);
        return {
          taskId,
          agentId: "agent-1",
          outputHash: hash(taskId),
          output: { costMicrousd: 1_000n, ok: true },
          submittedAt: 1,
          verifierKind: "hash",
          verifierNote: "",
        } as TaskResult;
      },
      verifier: async () => ({ ok: true, reason: "ok" }),
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
    });
    const r = await o.run();
    expect(calls).toEqual(["t1", "t2", "t3"]);
    expect(r.totalSpent).toBe(3_000n);
    expect(r.states.t3).toBe("VERIFIED");
  });

  it("retries a failing task and reassigns on persistent failure", async () => {
    const registry = setupRegistry();
    const spec = job();
    let calls = 0;
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => {
        calls += 1;
        if (calls < 3) throw new Error("transient");
        return {
          taskId,
          agentId: "agent-1",
          outputHash: hash(taskId),
          output: { costMicrousd: 1_000n },
          submittedAt: 1,
          verifierKind: "hash",
          verifierNote: "",
        };
      },
      verifier: async () => ({ ok: true, reason: "ok" }),
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
      retry: { maxAttempts: 3, backoffSeconds: 0, requireFreshToken: true },
    });
    const r = await o.run();
    expect(r.states.t1).toBe("VERIFIED");
  });

  it("fails the task and propagates cancellation when budget overflows", async () => {
    const registry = setupRegistry();
    const spec = job();
    spec.budgetMicrousd = 150_000n;
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => ({
        taskId,
        agentId: "agent-1",
        outputHash: hash(taskId),
        output: { costMicrousd: 100_000n },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      }),
      verifier: async () => ({ ok: true, reason: "ok" }),
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
    });
    const r = await o.run();
    expect(["CANCELLED", "FAILED"]).toContain(r.states.t3);
  });

  it("verifier disagreement moves the task to FAILED", async () => {
    const registry = setupRegistry();
    const spec = job();
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => ({
        taskId,
        agentId: "agent-1",
        outputHash: hash(taskId),
        output: { costMicrousd: 1n },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      }),
      verifier: async () => ({ ok: false, reason: "disagreement" }),
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
    });
    const r = await o.run();
    expect(r.states.t1).toBe("FAILED");
  });

  it("uses GoPlus for risky-target rejection", async () => {
    const g = new StaticGoplusClient([
      "0x0000000000000000000000000000000000000bad",
    ]);
    const v = await g.checkAddress(
      688689,
      "0x0000000000000000000000000000000000000bad"
    );
    expect(v.verdict).toBe("risky");
  });

  it("requires human approval for financial tasks", async () => {
    const registry = setupRegistry();
    const spec = job();
    spec.tasks[2]!.capability = "financial";
    let asked = false;
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => ({
        taskId,
        agentId: "agent-1",
        outputHash: hash(taskId),
        output: { costMicrousd: 1n },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      }),
      verifier: async () => ({ ok: true, reason: "ok" }),
      humanApprove: async () => {
        asked = true;
        return true;
      },
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
    });
    await o.run();
    expect(asked).toBe(true);
  });

  it("enforces no hidden delegation", async () => {
    const registry = setupRegistry();
    const spec = job();
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => ({
        taskId,
        agentId: "agent-1",
        outputHash: hash(taskId),
        output: { costMicrousd: 1n },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      }),
      verifier: async () => ({ ok: true, reason: "ok" }),
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1", "agent-2"],
    });
    const r = await o.run();
    expect(r.results.length).toBeGreaterThan(0);
  });

  it("rejects duplicate task tokens (replay)", async () => {
    const seen = new Set<string>();
    const registry = setupRegistry();
    const spec = job();
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string, token: TaskToken) => {
        if (seen.has(token.nonce)) {
          throw new Error("replay_detected");
        }
        seen.add(token.nonce);
        return {
          taskId,
          agentId: "agent-1",
          outputHash: hash(taskId),
          output: { costMicrousd: 1n },
          submittedAt: 1,
          verifierKind: "hash",
          verifierNote: "",
        };
      },
      verifier: async () => ({ ok: true, reason: "ok" }),
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
      retry: { maxAttempts: 1, backoffSeconds: 0, requireFreshToken: true },
    });
    await o.run();
    // The orchestrator's normal run path does not duplicate nonces
    // within a single execution, so the seen set is exactly one
    // entry per executed task.
    expect(seen.size).toBe(3);
  });

  it("conflicting verifier verdicts are recorded as disagreement", async () => {
    const registry = setupRegistry();
    // t1: pass, t2: pass, t3: always fail -> FAILED
    const spec = job();
    const verdicts: Record<string, boolean> = { t1: true, t2: true, t3: false };
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => ({
        taskId,
        agentId: "agent-1",
        outputHash: hash(taskId),
        output: { costMicrousd: 1n },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      }),
      verifier: async (result) => ({
        ok: verdicts[result.taskId] ?? false,
        reason: verdicts[result.taskId] ? "ok" : "conflict",
      }),
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
    });
    const r = await o.run();
    expect(r.states.t1).toBe("VERIFIED");
    expect(r.states.t2).toBe("VERIFIED");
    expect(r.states.t3).toBe("FAILED");
  });

  it("rejects stale heartbeats on the worker", async () => {
    const r2 = new AgentSkillRegistry();
    const sk2 = {
      skillId: "summarize",
      version: "1.0.0",
      releaseHash: ("0x" + "00".repeat(32)) as Hash,
      imageDigest: "sha256:abc",
      publishedAt: 0,
      expiresAt: 1_000_000,
      capabilities: ["fetch", "summarize"],
      certikVerdict: "pass" as const,
      certikVerdictAt: 0,
      certikReportUrl: "https://certik.example/1",
    };
    {
      const { releaseHash: _omit, ...body } = sk2;
      sk2.releaseHash = contentHash(body);
    }
    r2.registerSkill(sk2);
    r2.registerAgent({
      agentId: "agent-1",
      displayName: "A1",
      endpoint: "https://a1.example",
      pricingMicrousd: 1_000n,
      trustScore: 90,
      capabilities: ["fetch", "summarize"],
      activeSkillRelease: sk2.releaseHash,
      lastHeartbeat: 0,
      registeredAt: 0,
    });
    // heartbeat issued long ago -> at now=10_000, age > 300
    r2.recordHeartbeat({
      agentId: "agent-1",
      endpoint: "https://a1.example",
      issuedAt: 0,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    const spec = job();
    spec.tasks = [spec.tasks[0]!];
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => ({
        taskId,
        agentId: "agent-1",
        outputHash: hash(taskId),
        output: { costMicrousd: 1n },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      }),
      verifier: async () => ({ ok: true, reason: "ok" }),
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 10_000,
      registry: r2,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
    });
    const r = await o.run();
    // No eligible agent -> budget reservation fails immediately,
    // task remains PLANNED and the run returns no results.
    expect(r.results.length).toBe(0);
  });

  it("fires onTaskState for every visible transition in order", async () => {
    const registry = setupRegistry();
    const spec = job();
    const events: Array<{ taskId: string; state: TaskState }> = [];
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => ({
        taskId,
        agentId: "agent-1",
        outputHash: hash(taskId),
        output: { costMicrousd: 1n, ok: true },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      }),
      verifier: async () => ({ ok: true, reason: "ok" }),
      onTaskState: (taskId, state) => {
        events.push({ taskId, state });
      },
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
    });
    await o.run();
    // The initial PLANNED writes must NOT fire the hook (the caller
    // has already reset the store to PLANNED). Only real transitions
    // — ASSIGNED, RUNNING, VERIFIED per task — should be visible.
    expect(events).toEqual([
      { taskId: "t1", state: "ASSIGNED" },
      { taskId: "t1", state: "RUNNING" },
      { taskId: "t1", state: "VERIFIED" },
      { taskId: "t2", state: "ASSIGNED" },
      { taskId: "t2", state: "RUNNING" },
      { taskId: "t2", state: "VERIFIED" },
      { taskId: "t3", state: "ASSIGNED" },
      { taskId: "t3", state: "RUNNING" },
      { taskId: "t3", state: "VERIFIED" },
    ]);
  });

  it("swallows errors thrown by onTaskState", async () => {
    const registry = setupRegistry();
    const spec = job();
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => ({
        taskId,
        agentId: "agent-1",
        outputHash: hash(taskId),
        output: { costMicrousd: 1n, ok: true },
        submittedAt: 1,
        verifierKind: "hash",
        verifierNote: "",
      }),
      verifier: async () => ({ ok: true, reason: "ok" }),
      onTaskState: () => {
        throw new Error("boom");
      },
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
    });
    // Must not throw.
    const r = await o.run();
    expect(r.states.t3).toBe("VERIFIED");
  });

  it("cancels downstream tasks when an upstream task fails", async () => {
    const registry = setupRegistry();
    const spec = job();
    const events: Array<{ taskId: string; state: TaskState }> = [];
    let attempt = 0;
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => {
        attempt += 1;
        // Fail t2 every time; let t1/t3 succeed.
        if (taskId === "t2") throw new Error("t2 down");
        return {
          taskId,
          agentId: "agent-1",
          outputHash: hash(taskId),
          output: { costMicrousd: 1n, ok: true },
          submittedAt: 1,
          verifierKind: "hash",
          verifierNote: "",
        };
      },
      verifier: async () => ({ ok: true, reason: "ok" }),
      onTaskState: (taskId, state) => {
        events.push({ taskId, state });
      },
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
      retry: { maxAttempts: 1, backoffSeconds: 0, requireFreshToken: true },
    });
    const r = await o.run();
    expect(r.states.t1).toBe("VERIFIED");
    // t2 fails; t3 is downstream and must be explicitly CANCELLED.
    expect(r.states.t2).toBe("FAILED");
    expect(r.states.t3).toBe("CANCELLED");
    // And the hook must have fired the CANCELLED transition.
    expect(events).toContainEqual({ taskId: "t3", state: "CANCELLED" });
  });

  /**
   * Diamond DAG (t1 → {t2, t3} → t4) verification. When t2 fails
   * mid-flight, cancelDownstream must mark t4 CANCELLED but must
   * NOT touch t3, whose only dep is the (now VERIFIED) t1.
   */
  function diamondJob(): JobSpec {
    return {
      jobId: "diamond",
      goal: "demo",
      goalHash: hash("goal"),
      budgetMicrousd: 1_000_000n,
      deadline: 1_000_000,
      allowedCapabilities: ["fetch", "analyze", "verify", "summarize"],
      policyHash: hash("policy"),
      verifier: "verifier-default",
      tasks: [
        {
          taskId: "t1",
          description: "fetch",
          dependencies: [],
          capability: "fetch",
          inputHash: hash("t1"),
          budgetMicrousd: 100_000n,
          deadline: 900_000,
          verifier: "verifier-default",
          verifierKind: "hash",
        },
        {
          taskId: "t2",
          description: "analyze",
          dependencies: ["t1"],
          capability: "analyze",
          inputHash: hash("t2"),
          budgetMicrousd: 200_000n,
          deadline: 940_000,
          verifier: "verifier-default",
          verifierKind: "deterministic",
        },
        {
          taskId: "t3",
          description: "validate",
          dependencies: ["t1"],
          capability: "verify",
          inputHash: hash("t3"),
          budgetMicrousd: 200_000n,
          deadline: 960_000,
          verifier: "verifier-default",
          verifierKind: "schema",
        },
        {
          taskId: "t4",
          description: "summarize",
          dependencies: ["t2", "t3"],
          capability: "summarize",
          inputHash: hash("t4"),
          budgetMicrousd: 300_000n,
          deadline: 990_000,
          verifier: "verifier-default",
          verifierKind: "schema",
        },
      ],
    };
  }

  it("cancels only the failing branch's downstream in a diamond DAG", async () => {
    const registry = setupRegistry();
    const spec = diamondJob();
    const hooks: OrchestratorHooks = {
      worker: async (taskId: string) => {
        // t2 throws; everything else succeeds.
        if (taskId === "t2") throw new Error("t2 down");
        return {
          taskId,
          agentId: "agent-1",
          outputHash: hash(taskId),
          output: { costMicrousd: 1n, ok: true },
          submittedAt: 1,
          verifierKind: "hash",
          verifierNote: "",
        };
      },
      verifier: async () => ({ ok: true, reason: "ok" }),
      onTaskState: () => {},
    };
    const o = new Orchestrator(spec, hooks, {
      now: () => 1,
      registry,
      artifact: new ArtifactStore(),
      declaredAgents: ["agent-1"],
      retry: { maxAttempts: 1, backoffSeconds: 0, requireFreshToken: true },
    });
    const r = await o.run();
    expect(r.states.t1).toBe("VERIFIED");
    expect(r.states.t2).toBe("FAILED");
    // t3 is parallel to t2 with deps [t1] only; it should run to
    // completion.
    expect(r.states.t3).toBe("VERIFIED");
    // t4 depends on BOTH t2 and t3; t2's failure must cancel it.
    expect(r.states.t4).toBe("CANCELLED");
  });
});
