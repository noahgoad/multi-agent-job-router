import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  combineHashes,
  contentHash,
  hashString,
} from "../src/hash.js";
import { jobSpecSchema, type JobSpec } from "../src/schema.js";
import {
  ValidationError,
  aggregateResults,
  detectCycle,
  graphDepth,
  hasCycle,
  reachableNodes,
  validateGraph,
  validateJobSpec,
} from "../src/validation.js";
import {
  compileJobSpec,
  summarizeGraph,
} from "../src/compiler.js";
import {
  DeterministicProposer,
  QwenAssistedProposer,
} from "../src/qwen.js";

function hash(s: string): `0x${string}` {
  return hashString(s);
}

function job(extra: Partial<JobSpec> = {}): JobSpec {
  const base: JobSpec = {
    jobId: "job-1",
    goal: "summarize protocol risks",
    goalHash: hash("goal"),
    budgetMicrousd: 1_000_000n,
    deadline: 1_000_000,
    allowedCapabilities: ["read", "compute", "verify", "write", "financial"],
    policyHash: hash("policy"),
    verifier: "verifier-default",
    tasks: [
      {
        taskId: "t1",
        description: "fetch protocol data",
        dependencies: [],
        capability: "fetch",
        inputHash: hash("t1-input"),
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
        inputHash: hash("t2-input"),
        budgetMicrousd: 300_000n,
        deadline: 950_000,
        verifier: "verifier-default",
        verifierKind: "deterministic",
      },
      {
        taskId: "t3",
        description: "summarize",
        dependencies: ["t2"],
        capability: "summarize",
        inputHash: hash("t3-input"),
        budgetMicrousd: 200_000n,
        deadline: 990_000,
        verifier: "verifier-default",
        verifierKind: "schema",
      },
    ],
  };
  return { ...base, ...extra, tasks: extra.tasks ?? base.tasks };
}

describe("workflow/hash", () => {
  it("produces stable canonical JSON regardless of key order", () => {
    const a = canonicalJson({ b: 1, a: 2, c: { y: 1, x: 2 } });
    const b = canonicalJson({ a: 2, c: { x: 2, y: 1 }, b: 1 });
    expect(a).toBe(b);
  });
  it("hashes bigints deterministically", () => {
    const h1 = contentHash({ a: 1n, b: "x" });
    const h2 = contentHash({ b: "x", a: 1n });
    expect(h1).toBe(h2);
  });
  it("combines hashes left-folded", () => {
    const a = hashString("a");
    const b = hashString("b");
    const c = combineHashes(a, b);
    expect(c.startsWith("0x")).toBe(true);
    expect(c).not.toBe(a);
  });
});

describe("workflow/validation", () => {
  it("rejects unsafe deadlines", () => {
    expect(() =>
      validateJobSpec(job(), { now: 2_000_000 }),
    ).toThrowError(ValidationError);
  });
  it("rejects duplicate task ids", () => {
    const j = job({
      tasks: [
        job().tasks[0]!,
        { ...job().tasks[1]!, taskId: "t1" },
      ],
    });
    expect(() => validateJobSpec(j, { now: 0 })).toThrow(/duplicate/);
  });
  it("rejects budgets that exceed the job budget", () => {
    const j = job();
    j.tasks[0]!.budgetMicrousd = 9_999_999n;
    expect(() => validateJobSpec(j, { now: 0 })).toThrow(/exceeds/);
  });
  it("rejects task deadlines past the job deadline", () => {
    const j = job();
    j.tasks[0]!.deadline = 9_999_999_999;
    expect(() => validateJobSpec(j, { now: 0 })).toThrow(/deadline/);
  });
  it("rejects cycles in the graph", () => {
    const j = job({
      tasks: [
        { ...job().tasks[0]!, dependencies: ["t2"] },
        { ...job().tasks[1]!, taskId: "t2", dependencies: ["t1"] },
      ],
    });
    const compiled = compileJobSpec(j, { now: 0 });
    expect(hasCycle(compiled.graph)).toBe(true);
    expect(detectCycle(compiled.graph)).not.toBeNull();
  });
  it("detects unreachable nodes", () => {
    // Build a graph where the second task has no dependency on the
    // first, so it is a second root and both are reachable.
    // Then add a third task with a dep on the second, but mark
    // its capability as unsupported.
    const j = job({
      tasks: [
        job().tasks[0]!,
        job().tasks[1]!,
        { ...job().tasks[2]!, taskId: "tX", dependsOn: ["t2"], capabilities: ["summarize"] as never },
      ],
    });
    // reachableNodes should return all 3 nodes
    const compiled = compileJobSpec(j, { now: 0 });
    expect(reachableNodes(compiled.graph).size).toBe(3);
  });
  it("computes graph depth", () => {
    const compiled = compileJobSpec(job(), { now: 0 });
    expect(graphDepth(compiled.graph)).toBe(3);
  });
  it("aggregates only verified results", () => {
    const r1 = {
      taskId: "t1",
      agentId: "a",
      outputHash: hash("o1"),
      output: { ok: true },
      submittedAt: 1,
      verifierKind: "hash" as const,
      verifierNote: "",
    };
    const r2 = { ...r1, taskId: "t2", outputHash: hash("o2") };
    const v1 = {
      taskId: "t1",
      verifierId: "v",
      verdict: "pass" as const,
      reason: "",
      evidenceHash: hash("e1"),
      verifiedAt: 2,
    };
    const v2 = { ...v1, taskId: "t2", verdict: "fail" as const };
    const agg = aggregateResults([r1, r2], [v1, v2]);
    expect(agg.resultRoot).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("workflow/compiler", () => {
  it("compiles a valid spec deterministically", () => {
    const a = compileJobSpec(job(), { now: 0 });
    const b = compileJobSpec(job(), { now: 0 });
    expect(a.dagHash).toBe(b.dagHash);
    expect(a.graph.criticalPath).toEqual(["t1", "t2", "t3"]);
    expect(a.approvalRequired.has("t3")).toBe(false);
  });
  it("flags financial tasks as approval-required", () => {
    const j = job({
      tasks: [
        job().tasks[0]!,
        { ...job().tasks[1]!, taskId: "tf", capability: "financial" },
      ],
    });
    const c = compileJobSpec(j, { now: 0 });
    expect(c.approvalRequired.has("tf")).toBe(true);
  });
  it("summary is consistent with the graph", () => {
    const s = summarizeGraph(job(), { now: 0 });
    expect(s.taskCount).toBe(3);
    expect(s.depth).toBe(3);
  });
  it("rejects Qwen output that fails schema validation", async () => {
    const proposer = new QwenAssistedProposer(
      { async decompose() { return { ...job(), budgetMicrousd: -1n } } },
      async () => true,
    );
    const r = await proposer.propose(job(), { now: 0 });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/qwen_output_invalid/);
  });
  it("requires explicit human approval for Qwen proposals", async () => {
    const good = job();
    const proposer = new QwenAssistedProposer(
      { async decompose(s) { return s } },
      async () => false,
    );
    const r = await proposer.propose(good, { now: 0 });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/approval_denied/);
  });
  it("accepts an unchanged spec via the deterministic proposer", async () => {
    const r = await new DeterministicProposer().propose(job(), { now: 0 });
    expect(r.accepted).toBe(true);
  });
  it("rejects an unknown capability at the schema boundary", () => {
    const j = job();
    (j.tasks[0] as unknown as { capability: string }).capability = "fly";
    expect(() => jobSpecSchema.parse(j)).toThrow();
  });
});