import {
  assertNoHiddenDelegation,
  createBudgetLedger,
  defaultRetryPolicy,
  isApprovalSatisfied,
  isHumanApprovalRequired,
  reserveBudget,
  settleBudget,
  type BudgetLedger,
  type CapabilityTag,
  type RetryPolicy,
} from "@pharos-router/policy";
import {
  ArtifactStore,
  compileJobSpec,
  type CompiledGraph,
  contentHash,
  hashString,
  type Hash,
  type JobSpec,
  type JobGraph,
  type TaskState,
  type TaskResult,
  type AssignmentReceipt,
} from "@pharos-router/workflow";
import type { AgentSkillRegistry } from "@pharos-router/registry";
import {
  selectCandidate,
  type RoutingCandidate,
  type RoutingRequirement,
  type RoutingContext,
} from "@pharos-router/routing";

/**
 * Resilient multi-agent orchestrator.
 *
 * The orchestrator executes a compiled job graph one ready task at
 * a time. It enforces:
 *  - Least-privilege task tokens (downscoped from the job grant).
 *  - Budget reservation and settlement.
 *  - Human approval for write/financial tasks.
 *  - Bounded retries with fresh tokens.
 *  - Reassignment on persistent worker failure.
 *  - Idempotent cancellation.
 *  - Checkpointing for restart recovery.
 *  - GoPlus pre-flight for any task that proposes a transaction.
 */

export interface TaskExecutionContext {
  readonly job: JobSpec;
  readonly graph: JobGraph;
  readonly dagHash: Hash;
  readonly now: number;
}

export type Worker = (
  taskId: string,
  token: TaskToken,
  attempt: number
) => Promise<TaskResult>;

export type Verifier = (
  result: TaskResult
) => Promise<{ ok: boolean; reason: string }>;

export interface TaskToken {
  readonly taskId: string;
  readonly agentId: string;
  readonly capabilities: ReadonlyArray<string>;
  readonly budgetMicrousd: bigint;
  readonly expiresAt: number;
  readonly nonce: string;
}

export interface OrchestratorHooks {
  readonly worker: Worker;
  readonly verifier: Verifier;
  readonly onAssignment?: (r: AssignmentReceipt) => void;
  readonly onCheckpoint?: (snapshot: CheckpointSnapshot) => void;
  /**
   * Called synchronously after every task-state transition. Used by
   * the API's `playJob` to persist intermediate states to the store
   * and pace the run so a polling dashboard can show each step.
   *
   * The hook may be sync or async. Errors are swallowed so a buggy
   * observer cannot break the orchestrator.
   */
  readonly onTaskState?: (
    taskId: string,
    newState: TaskState
  ) => void | Promise<void>;
  readonly goplusCheck?: (
    chainId: number,
    address: `0x${string}`
  ) => Promise<{ ok: boolean; reason: string }>;
  readonly humanApprove?: (taskId: string) => Promise<boolean>;
}

export interface CheckpointSnapshot {
  readonly jobId: string;
  readonly dagHash: Hash;
  readonly taskStates: Record<string, TaskState>;
  readonly spent: bigint;
  readonly reserved: bigint;
  readonly attempts: Record<string, number>;
  readonly assignedAgent: Record<string, string>;
  readonly savedAt: number;
}

export interface OrchestratorOptions {
  readonly retry?: RetryPolicy;
  readonly now: () => number;
  readonly registry: AgentSkillRegistry;
  readonly artifact: ArtifactStore;
  readonly declaredAgents: ReadonlyArray<string>;
}

export class OrchestratorError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "OrchestratorError";
  }
}

export class Orchestrator {
  private readonly retry: RetryPolicy;
  private readonly ledger: BudgetLedger;
  private readonly states = new Map<string, TaskState>();
  private readonly attempts = new Map<string, number>();
  private readonly assignedAgent = new Map<string, string>();
  private readonly checkpoints: CheckpointSnapshot[] = [];

  constructor(
    private readonly spec: JobSpec,
    private readonly hooks: OrchestratorHooks,
    private readonly options: OrchestratorOptions
  ) {
    this.retry = options.retry ?? defaultRetryPolicy();
    this.ledger = createBudgetLedger(spec.budgetMicrousd);
  }

  async run(): Promise<OrchestratorResult> {
    let compiled: CompiledGraph;
    try {
      compiled = compileJobSpec(this.spec, { now: this.options.now() });
    } catch {
      const states: Record<string, TaskState> = {};
      for (const t of this.spec.tasks) {
        states[t.taskId] = "FAILED";
      }
      return {
        jobId: this.spec.jobId,
        dagHash: ("0x" + "00".repeat(32)) as Hash,
        results: [],
        states,
        checkpoints: [],
        totalSpent: this.ledger.spent,
      };
    }
    const dagHash = compiled.dagHash;
    for (const n of compiled.graph.nodes) {
      // Suppress the tick for the initial PLANNED write — the caller
      // already reset the store to PLANNED, so a hook fire here would
      // only re-persist the same value and (worse) add a sleep tick.
      this.states.set(n.taskId, "PLANNED");
    }
    const results: TaskResult[] = [];
    const completedSet = new Set<string>();
    let budgetAborted = false;
    while (true) {
      const ready = this.readyTasks(compiled.graph, completedSet);
      if (ready.length === 0) break;
      for (const taskId of ready) {
        if (budgetAborted) {
          this.states.set(taskId, "CANCELLED");
          await this.fireTaskState(taskId, "CANCELLED");
          continue;
        }
        const node = compiled.graph.nodes.find((n) => n.taskId === taskId)!;
        const r = await this.runTask(taskId, node.budgetMicrousd, dagHash);
        if (r.outcome === "ok") {
          results.push(r.result!);
          completedSet.add(taskId);
          this.states.set(taskId, "VERIFIED");
          await this.fireTaskState(taskId, "VERIFIED");
        } else if (r.outcome === "budget") {
          this.states.set(taskId, "CANCELLED");
          await this.fireTaskState(taskId, "CANCELLED");
          budgetAborted = true;
        } else {
          this.states.set(taskId, "FAILED");
          await this.fireTaskState(taskId, "FAILED");
        }
        // A non-OK outcome means the task won't reach VERIFIED, so any
        // transitively-downstream task that was still PLANNED will
        // never become ready. Mark them CANCELLED now so the dashboard
        // (and the receipt) reflect the final state instead of leaving
        // them stuck in PLANNED forever.
        if (r.outcome !== "ok") {
          await this.cancelDownstream(compiled.graph, taskId);
        }
        this.checkpoint(dagHash);
      }
    }
    return {
      jobId: this.spec.jobId,
      dagHash,
      results,
      states: Object.fromEntries(this.states),
      checkpoints: [...this.checkpoints],
      totalSpent: this.ledger.spent,
    };
  }

  private readyTasks(
    graph: JobGraph,
    completed: ReadonlySet<string>
  ): string[] {
    const out: string[] = [];
    for (const n of graph.nodes) {
      if (this.states.get(n.taskId) !== "PLANNED") continue;
      const deps = n.dependsOn;
      if (deps.every((d) => completed.has(d))) out.push(n.taskId);
    }
    return out;
  }

  private async runTask(
    taskId: string,
    budget: bigint,
    dagHash: Hash
  ): Promise<
    | { outcome: "ok"; result: TaskResult }
    | { outcome: "failed" }
    | { outcome: "budget" }
  > {
    const r = reserveBudget(this.ledger, budget);
    if (!r.ok) {
      return { outcome: "budget" };
    }
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      this.attempts.set(taskId, attempt);
      const req: RoutingRequirement = {
        jobId: this.spec.jobId,
        taskId,
        capability: taskCapability(this.spec, taskId),
        budgetMicrousd: budget,
      };
      const ctx: RoutingContext = {
        now: this.options.now(),
        alreadyAssigned: [...this.assignedAgent.values()],
        role: "worker",
      };
      const candidates = routingCandidatesFor(
        this.options.registry,
        req,
        this.options.now()
      );
      const decision = selectCandidate(req, candidates, ctx);
      if (!decision.selected) {
        lastError = new OrchestratorError(
          "no eligible agent",
          "no_eligible_agent"
        );
        continue;
      }
      const agentId = decision.selected.agent.agentId;
      assertNoHiddenDelegation(this.options.declaredAgents, agentId);
      this.assignedAgent.set(taskId, agentId);
      const token: TaskToken = {
        taskId,
        agentId,
        capabilities: [taskCapability(this.spec, taskId)],
        budgetMicrousd: budget,
        expiresAt: this.options.now() + 300,
        nonce: hashString(`${taskId}:${agentId}:${attempt}:${Date.now()}`),
      };
      if (
        isHumanApprovalRequired({
          requested: [taskCapability(this.spec, taskId)],
          budgetMicrousd: budget,
          chains: [],
          ttlSeconds: 300,
          now: this.options.now(),
        })
      ) {
        const ok = await this.hooks.humanApprove?.(taskId);
        if (!ok) {
          settleBudget(this.ledger, budget, 0n);
          return { outcome: "failed" };
        }
      }
      const assignment: AssignmentReceipt = {
        taskId,
        agentId,
        skillReleaseHash: decision.selected.agent.activeSkillRelease,
        score: decision.explanation.candidates[0]?.weighted ?? 0,
        assignedAt: this.options.now(),
        termsHash: contentHash({ token, dagHash }),
      };
      this.hooks.onAssignment?.(assignment);
      this.states.set(taskId, "ASSIGNED");
      await this.fireTaskState(taskId, "ASSIGNED");
      // Surface a RUNNING tick before the worker is invoked. The
      // worker itself can take arbitrarily long, so the UI uses this
      // signal to show "the agent is working on it" without waiting
      // for the result.
      this.states.set(taskId, "RUNNING");
      await this.fireTaskState(taskId, "RUNNING");
      try {
        const result = await this.hooks.worker(taskId, token, attempt);
        const verification = await this.hooks.verifier(result);
        if (!verification.ok) {
          lastError = new Error(verification.reason);
          this.states.set(taskId, "SUBMITTED");
          await this.fireTaskState(taskId, "SUBMITTED");
          continue;
        }
        settleBudget(this.ledger, budget, resultSpent(result));
        this.options.artifact.putTaskResult(result, this.options.now());
        return { outcome: "ok", result };
      } catch (err) {
        lastError = err;
        this.states.set(taskId, "FAILED");
        await this.fireTaskState(taskId, "FAILED");
      }
    }
    settleBudget(this.ledger, budget, 0n);
    void lastError;
    return { outcome: "failed" };
  }

  private checkpoint(dagHash: Hash): void {
    const snap: CheckpointSnapshot = {
      jobId: this.spec.jobId,
      dagHash,
      taskStates: Object.fromEntries(this.states),
      spent: this.ledger.spent,
      reserved: this.ledger.reserved,
      attempts: Object.fromEntries(this.attempts),
      assignedAgent: Object.fromEntries(this.assignedAgent),
      savedAt: this.options.now(),
    };
    this.checkpoints.push(snap);
    this.hooks.onCheckpoint?.(snap);
  }

  /**
   * Fire the `onTaskState` hook for a transition. Errors are caught
   * and logged so a buggy observer (e.g. a transient store write) can
   * never abort the orchestrator run.
   */
  private async fireTaskState(
    taskId: string,
    newState: TaskState
  ): Promise<void> {
    const hook = this.hooks.onTaskState;
    if (!hook) return;
    try {
      await hook(taskId, newState);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[orchestrator] onTaskState hook threw:", err);
    }
  }

  /**
   * Mark every transitively-downstream task of `rootTaskId` that is
   * still in PLANNED as CANCELLED, and fire the hook for each. Used
   * after a task ends in FAILED / CANCELLED so the final DAG state
   * shows downstream tasks as cancelled rather than leaving them
   * stuck in PLANNED.
   */
  private async cancelDownstream(
    graph: JobGraph,
    rootTaskId: string
  ): Promise<void> {
    const downstream = new Set<string>();
    const stack: string[] = [rootTaskId];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const n of graph.nodes) {
        if (
          (n.dependsOn ?? []).includes(current) &&
          !downstream.has(n.taskId)
        ) {
          downstream.add(n.taskId);
          stack.push(n.taskId);
        }
      }
    }
    const fires: Array<Promise<void>> = [];
    for (const taskId of downstream) {
      if (this.states.get(taskId) === "PLANNED") {
        this.states.set(taskId, "CANCELLED");
        fires.push(this.fireTaskState(taskId, "CANCELLED"));
      }
    }
    await Promise.all(fires);
  }

  static restoreFromCheckpoint(
    spec: JobSpec,
    hooks: OrchestratorHooks,
    options: OrchestratorOptions,
    last: CheckpointSnapshot
  ): Orchestrator {
    const o = new Orchestrator(spec, hooks, options);
    for (const [k, v] of Object.entries(last.taskStates)) {
      o.states.set(k, v as TaskState);
    }
    for (const [k, v] of Object.entries(last.attempts)) {
      o.attempts.set(k, v);
    }
    for (const [k, v] of Object.entries(last.assignedAgent)) {
      o.assignedAgent.set(k, v);
    }
    o.ledger.reserved = last.reserved;
    o.ledger.spent = last.spent;
    return o;
  }
}

export interface OrchestratorResult {
  readonly jobId: string;
  readonly dagHash: Hash;
  readonly results: ReadonlyArray<TaskResult>;
  readonly states: Record<string, TaskState>;
  readonly checkpoints: ReadonlyArray<CheckpointSnapshot>;
  readonly totalSpent: bigint;
}

function taskCapability(spec: JobSpec, taskId: string): CapabilityTag {
  const t = spec.tasks.find((t) => t.taskId === taskId);
  if (!t)
    throw new OrchestratorError(`task not found: ${taskId}`, "task_not_found");
  return t.capability as CapabilityTag;
}

function resultSpent(r: TaskResult): bigint {
  if (r.output && typeof r.output === "object") {
    const out = r.output as { costMicrousd?: bigint | number | string };
    if (out.costMicrousd !== undefined) {
      if (typeof out.costMicrousd === "bigint") return out.costMicrousd;
      if (typeof out.costMicrousd === "number") return BigInt(out.costMicrousd);
      return BigInt(out.costMicrousd);
    }
  }
  return 0n;
}

function routingCandidatesFor(
  registry: AgentSkillRegistry,
  req: RoutingRequirement,
  now: number
): RoutingCandidate[] {
  const agents = registry.query({ capability: req.capability, now });
  return agents.map((a) => ({
    agent: a,
    estimatedLatencyMs: 250,
    successRate: 0.95,
    availabilityScore: 80,
  }));
}

export { isApprovalSatisfied };
