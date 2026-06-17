import { combineHashes, contentHash, type Hash } from "./hash.js";
import type { JobSpec } from "./schema.js";
import {
  ValidationError,
  graphDepth,
  hasCycle,
  reachableNodes,
  validateGraph,
  validateJobSpec,
  type ValidationContext,
} from "./validation.js";
import { isHumanApprovalRequired } from "@pharos-router/policy";

/**
 * Bounded workflow compiler.
 *
 * The compiler converts a validated `JobSpec` into a deterministic
 * `JobGraph` (a DAG with budget allocations, approval gates, and a
 * critical path). The output is reproducible: identical inputs
 * produce byte-identical graphs, and the dag hash is stable.
 *
 * The compiler is intentionally minimal:
 *  - It does not call any external LLM. The Qwen-assisted proposal
 *    step is optional and lives in `qwen.ts`.
 *  - It does not invent tasks. Every node corresponds to a task the
 *    user explicitly listed in the spec.
 *  - It does not lower permissions. If a child task would need a
 *    capability the parent job did not grant, the spec is rejected.
 *
 * A cyclic graph is not an error here: the compiler returns the
 * graph with an empty critical path. Callers that require a DAG
 * should use `summarizeGraph` or check `hasCycle` themselves.
 */

export interface CompiledGraph {
  readonly graph: import("./schema.js").JobGraph;
  readonly dagHash: Hash;
  readonly approvalRequired: ReadonlySet<string>;
}

export interface CompileOptions {
  readonly now: number;
  readonly maxFanout?: number;
  readonly maxDepth?: number;
}

const DEFAULTS = {
  maxFanout: 16,
  maxDepth: 32,
};

export function compileJobSpec(
  spec: JobSpec,
  options: CompileOptions,
): CompiledGraph {
  const ctx: ValidationContext = {
    now: options.now,
    maxFanout: options.maxFanout ?? DEFAULTS.maxFanout,
    maxDepth: options.maxDepth ?? DEFAULTS.maxDepth,
  };
  validateJobSpec(spec, ctx);
  const nodes = spec.tasks.map((t) => {
    const approvalRequired = isHumanApprovalRequired({
      requested: [t.capability],
      budgetMicrousd: t.budgetMicrousd,
      chains: [],
      ttlSeconds: Math.max(1, t.deadline - options.now),
      now: options.now,
    });
    return {
      taskId: t.taskId,
      dependsOn: [...t.dependencies].sort(),
      capability: t.capability,
      budgetMicrousd: t.budgetMicrousd,
      deadline: t.deadline,
      verifierKind: t.verifierKind,
      approvalRequired,
    };
  });
  const graph = {
    jobId: spec.jobId,
    nodes,
    criticalPath: [] as string[],
  };
  const cyclic = hasCycle(graph);
  if (!cyclic) {
    validateGraph(spec, graph, ctx);
    graph.criticalPath = criticalPath(nodes);
  }
  return {
    graph,
    dagHash: contentHash(graph) as Hash,
    approvalRequired: new Set(
      nodes.filter((n) => n.approvalRequired).map((n) => n.taskId),
    ),
  };
}

function criticalPath(
  nodes: ReadonlyArray<{
    taskId: string;
    dependsOn: ReadonlyArray<string>;
    deadline: number;
  }>,
): string[] {
  const map = new Map(nodes.map((n) => [n.taskId, n]));
  const memo = new Map<string, { length: number; path: string[] }>();
  function best(id: string): { length: number; path: string[] } {
    const cached = memo.get(id);
    if (cached) return cached;
    const node = map.get(id);
    if (!node) return { length: 0, path: [] };
    if (node.dependsOn.length === 0) {
      const r = { length: 1, path: [id] };
      memo.set(id, r);
      return r;
    }
    let bestResult = { length: 0, path: [] as string[] };
    for (const dep of node.dependsOn) {
      const r = best(dep);
      if (r.length > bestResult.length) bestResult = r;
    }
    const result = { length: bestResult.length + 1, path: [...bestResult.path, id] };
    memo.set(id, result);
    return result;
  }
  let overall = { length: 0, path: [] as string[] };
  for (const n of nodes) {
    const r = best(n.taskId);
    if (r.length > overall.length) overall = r;
  }
  return overall.path;
}

export function summarizeGraph(spec: JobSpec, options: CompileOptions): {
  taskCount: number;
  depth: number;
  cycle: boolean;
  reachable: number;
  dagHash: Hash;
  budgetRoot: Hash;
} {
  const compiled = compileJobSpec(spec, options);
  const cycle = hasCycle(compiled.graph);
  const reachable = reachableNodes(compiled.graph);
  const budgetHashes = compiled.graph.nodes
    .map((n) => contentHash({ taskId: n.taskId, b: n.budgetMicrousd.toString() }))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    taskCount: compiled.graph.nodes.length,
    depth: graphDepth(compiled.graph),
    cycle,
    reachable: reachable.size,
    dagHash: compiled.dagHash,
    budgetRoot: contentHash({ root: combineHashesLocal(budgetHashes) }),
  };
}

function combineHashesLocal(hashes: ReadonlyArray<Hash>): Hash {
  return combineHashes(...hashes);
}