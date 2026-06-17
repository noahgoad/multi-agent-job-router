import type { Hash } from "./hash.js";
import type { JobGraph, JobSpec, TaskResult, VerificationRecord } from "./schema.js";
import { contentHash, combineHashes } from "./hash.js";

/**
 * Validators for job specs, DAGs, and task results.
 *
 * Every value produced by the workflow compiler, the agent registry,
 * and the orchestrator passes through one of these validators. A
 * failure here is treated as a hard error and aborts the job.
 */

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface ValidationContext {
  readonly now: number;
  readonly maxFanout: number;
  readonly maxDepth: number;
}

export function validateJobSpec(
  spec: JobSpec,
  ctx: ValidationContext,
): void {
  if (spec.deadline <= ctx.now) {
    throw new ValidationError(
      "deadline must be in the future",
      "unsafe_deadline",
      { deadline: spec.deadline, now: ctx.now },
    );
  }
  if (spec.budgetMicrousd <= 0n) {
    throw new ValidationError(
      "job budget must be positive",
      "invalid_budget",
    );
  }
  const seen = new Set<string>();
  let total = 0n;
  for (const t of spec.tasks) {
    if (seen.has(t.taskId)) {
      throw new ValidationError(
        `duplicate task id: ${t.taskId}`,
        "duplicate_task",
      );
    }
    seen.add(t.taskId);
    total += t.budgetMicrousd;
    if (t.budgetMicrousd > spec.budgetMicrousd) {
      throw new ValidationError(
        `task ${t.taskId} budget exceeds job budget`,
        "excessive_budget",
      );
    }
    if (t.deadline > spec.deadline) {
      throw new ValidationError(
        `task ${t.taskId} deadline exceeds job deadline`,
        "unsafe_deadline",
      );
    }
    for (const dep of t.dependencies) {
      if (!seen.has(dep) && !spec.tasks.some((x) => x.taskId === dep)) {
        throw new ValidationError(
          `task ${t.taskId} depends on unknown task ${dep}`,
          "unknown_dependency",
        );
      }
    }
  }
  if (total > spec.budgetMicrousd) {
    throw new ValidationError(
      "sum of task budgets exceeds job budget",
      "budget_overflow",
    );
  }
}

export function validateGraph(
  spec: JobSpec,
  graph: JobGraph,
  ctx: ValidationContext,
): void {
  if (graph.jobId !== spec.jobId) {
    throw new ValidationError(
      "graph jobId does not match spec",
      "graph_mismatch",
    );
  }
  const map = new Map(graph.nodes.map((n) => [n.taskId, n]));
  for (const n of graph.nodes) {
    for (const dep of n.dependsOn) {
      if (!map.has(dep)) {
        throw new ValidationError(
          `node ${n.taskId} depends on missing node ${dep}`,
          "missing_dependency",
        );
      }
    }
  }
  if (hasCycle(graph)) {
    throw new ValidationError("graph has a cycle", "cycle_detected");
  }
  const reachable = reachableNodes(graph);
  for (const n of graph.nodes) {
    if (!reachable.has(n.taskId)) {
      throw new ValidationError(
        `node ${n.taskId} is unreachable`,
        "unreachable_node",
      );
    }
  }
  const maxFanout = graph.nodes.reduce(
    (acc, n) => Math.max(acc, n.dependsOn.length),
    0,
  );
  if (maxFanout > ctx.maxFanout) {
    throw new ValidationError(
      `fanout ${maxFanout} exceeds ${ctx.maxFanout}`,
      "fanout_exceeded",
    );
  }
  const depth = graphDepth(graph);
  if (depth > ctx.maxDepth) {
    throw new ValidationError(
      `depth ${depth} exceeds ${ctx.maxDepth}`,
      "depth_exceeded",
    );
  }
}

export function detectCycle(graph: JobGraph): string[] | null {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.taskId, n.dependsOn);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const k of adj.keys()) color.set(k, WHITE);
  const stack: string[] = [];
  function dfs(u: string): string[] | null {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === WHITE) {
        const r = dfs(v);
        if (r) return r;
      } else if (c === GRAY) {
        return [...stack.slice(stack.indexOf(v)), v];
      }
    }
    color.set(u, BLACK);
    stack.pop();
    return null;
  }
  for (const k of adj.keys()) {
    if ((color.get(k) ?? WHITE) === WHITE) {
      const r = dfs(k);
      if (r) return r;
    }
  }
  return null;
}

export function hasCycle(graph: JobGraph): boolean {
  return detectCycle(graph) !== null;
}

export function reachableNodes(graph: JobGraph): Set<string> {
  const out = new Map<string, string[]>();
  for (const n of graph.nodes) {
    if (!out.has(n.taskId)) out.set(n.taskId, []);
    for (const dep of n.dependsOn) {
      if (!out.has(dep)) out.set(dep, []);
      out.get(dep)!.push(n.taskId);
    }
  }
  const seen = new Set<string>();
  const roots = graph.nodes.filter((n) => n.dependsOn.length === 0);
  for (const r of roots) {
    seen.add(r.taskId);
    const stack = [r.taskId];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const next of out.get(cur) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      }
    }
  }
  return seen;
}

export function graphDepth(graph: JobGraph): number {
  const map = new Map(graph.nodes.map((n) => [n.taskId, n]));
  const memo = new Map<string, number>();
  function depth(id: string): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    const node = map.get(id);
    if (!node) return 0;
    const d =
      node.dependsOn.length === 0
        ? 1
        : 1 + Math.max(...node.dependsOn.map((dep) => depth(dep)));
    memo.set(id, d);
    return d;
  }
  let max = 0;
  for (const n of graph.nodes) max = Math.max(max, depth(n.taskId));
  return max;
}

export function aggregateResults(
  results: ReadonlyArray<TaskResult>,
  verifications: ReadonlyArray<VerificationRecord>,
): { resultRoot: Hash; verificationRoot: Hash } {
  const verified = new Set(
    verifications.filter((v) => v.verdict === "pass").map((v) => v.taskId),
  );
  const filtered = results.filter((r) => verified.has(r.taskId));
  const resultHashes = filtered
    .map((r) => contentHash(r))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const verificationHashes = verifications
    .map((v) => contentHash(v))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    resultRoot: combineHashes(...resultHashes),
    verificationRoot: combineHashes(...verificationHashes),
  };
}