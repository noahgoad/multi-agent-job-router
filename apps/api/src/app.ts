import {
  compileJobSpec,
  contentHash,
  jobSpecSchema,
  type JobSpec,
  type JobReceipt,
  type JobGraph,
  type AssignmentReceipt,
  type TaskState,
  type Hash,
  type TaskResult,
  type VerificationRecord,
} from "@pharos-router/workflow";
import { AgentSkillRegistry } from "@pharos-router/registry";
import { Orchestrator } from "@pharos-router/orchestrator";
import { hashVerifier, aggregate } from "@pharos-router/verifier";
import { ArtifactStore } from "@pharos-router/workflow";
import {
  computeAssignmentRoot,
  computeResultRoot,
} from "@pharos-router/contracts";
import type { FileStorage } from "./storage.js";

/**
 * In-memory job store.
 *
 * A real deployment would persist these to PostgreSQL. The store is
 * intentionally minimal but exposes the same operations the API and
 * dashboard need.
 */

export interface StoredJob {
  readonly spec: JobSpec;
  graph: JobGraph;
  dagHash: Hash;
  approval: { approver: string; approvedAt: number } | null;
  state: Map<string, TaskState>;
  assignments: AssignmentReceipt[];
  results: TaskResult[];
  verifications: VerificationRecord[];
  receipt?: JobReceipt;
  cancelled: boolean;
  createdAt: number;
}

export class JobStore {
  private readonly jobs = new Map<string, StoredJob>();
  private readonly storage: FileStorage | null;

  constructor(opts: { storage?: FileStorage | null } = {}) {
    this.storage = opts.storage ?? null;
    if (this.storage) {
      // Hydrate from disk so an API restart preserves the demo job.
      const loaded = this.storage.load();
      for (const [id, job] of loaded) this.jobs.set(id, job);
    }
  }

  create(spec: JobSpec, now: number): StoredJob {
    const parsed = jobSpecSchema.parse(spec);
    const compiled = compileJobSpec(parsed, { now });
    const job: StoredJob = {
      spec: parsed,
      graph: compiled.graph,
      dagHash: compiled.dagHash,
      approval: null,
      state: new Map(
        compiled.graph.nodes.map((n) => [n.taskId, "PLANNED" as TaskState])
      ),
      assignments: [],
      results: [],
      verifications: [],
      receipt: undefined,
      cancelled: false,
      createdAt: now,
    };
    this.jobs.set(parsed.jobId, job);
    this.persist();
    return job;
  }

  get(jobId: string): StoredJob | undefined {
    return this.jobs.get(jobId);
  }

  list(): StoredJob[] {
    return [...this.jobs.values()];
  }

  cancel(jobId: string, _reason: string): void {
    const j = this.jobs.get(jobId);
    if (!j) return;
    j.cancelled = true;
    for (const [k] of j.state) j.state.set(k, "CANCELLED");
    this.persist();
  }

  /** Flush the in-memory map back to the storage backend. Call
   *  after any mutation that the API layer wants to survive a
   *  restart (create, approve, execute, reset, cancel, retry). */
  save(): void {
    this.persist();
  }

  private persist(): void {
    if (this.storage) this.storage.save(this.jobs);
  }
}

export interface AppDeps {
  readonly store: JobStore;
  readonly registry: AgentSkillRegistry;
  readonly artifact: ArtifactStore;
  readonly humanApprove: (jobId: string, taskId: string) => Promise<boolean>;
  readonly now: () => number;
}

export const APP_DEPS_KEY = Symbol("pharos-router/app-deps");

export function buildApp(deps: AppDeps) {
  const { store, registry, artifact, humanApprove, now } = deps;

  return {
    store,
    registry,
    artifact,
    humanApprove,
    now,
    async createJob(spec: JobSpec) {
      const job = store.create(spec, now());
      store.save();
      return view(job);
    },
    async approveJob(jobId: string, approver: string) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      j.approval = { approver, approvedAt: now() };
      store.save();
      return view(j);
    },
    async routeJob(jobId: string) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      return view(j);
    },
    async executeJob(jobId: string) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      if (!j.approval) throw new Error("not_approved");
      const o = new Orchestrator(
        j.spec,
        defaultHooks(j, { humanApprove, now }),
        {
          now,
          registry,
          artifact,
          declaredAgents: registry.query({ now: now() }).map((a) => a.agentId),
        }
      );
      const r = await o.run();
      j.results.push(...r.results);
      for (const [k, v] of Object.entries(r.states)) j.state.set(k, v);
      finalizeReceipt(j, r, now);
      store.save();
      return view(j);
    },
    /**
     * Reset the in-memory job to PLANNED, dropping assignments,
     * results, verifications, and the receipt. The DAG and spec are
     * untouched. Used by the dashboard's "Run demo" flow so the
     * polled store walks through every transition visibly.
     */
    async resetJob(jobId: string) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      resetJobState(j);
      store.save();
      return view(j);
    },
    /**
     * Run the orchestrator with deliberate pacing between state
     * transitions. The `onTaskState` hook persists the new state to
     * the store immediately and then sleeps for `tickMs`, so a
     * polling client watching `GET /jobs/:id` sees the job walk
     * through PLANNED → ASSIGNED → RUNNING → VERIFIED one tick at a
     * time. Used by the dashboard "Run demo" button.
     *
     * `scenario` selects which failure mode (if any) to inject so
     * the dashboard can demo every interesting DAG outcome without
     * needing a live fault-injector:
     *   - "happy"    : all tasks VERIFIED (default)
     *   - "verifier" : t2 worker returns a wrong outputHash so the
     *                  hashVerifier disagrees. Final: t1 V, t2 F, t3 C
     *   - "failure"  : t1 worker throws on every attempt. Final:
     *                  t1 F, t2/t3 CANCELLED (downstream)
     */
    async playJob(
      jobId: string,
      opts: { tickMs?: number; approver?: string; scenario?: PlayScenario } = {}
    ) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      // Auto-approve for the demo so a single click drives the
      // entire flow. A real operator would approve explicitly.
      if (!j.approval) {
        j.approval = {
          approver: opts.approver ?? "demo-player",
          approvedAt: now(),
        };
      }
      resetJobState(j);
      const tickMs = Math.max(0, Math.min(opts.tickMs ?? 600, 5_000));
      const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
      const scenario: PlayScenario = opts.scenario ?? "happy";
      const o = new Orchestrator(
        j.spec,
        {
          ...defaultHooks(j, { humanApprove, now }),
          ...scenarioWorkerHooks(scenario, { now }),
          onTaskState: async (taskId, newState) => {
            j.state.set(taskId, newState);
            // Yield long enough for a 400ms poll to pick the change up
            // even if it lands at the tail of an interval.
            await sleep(tickMs);
          },
        },
        {
          now,
          registry,
          artifact,
          declaredAgents: registry.query({ now: now() }).map((a) => a.agentId),
        }
      );
      const r = await o.run();
      j.results.push(...r.results);
      for (const [k, v] of Object.entries(r.states)) j.state.set(k, v);
      finalizeReceipt(j, r, now);
      store.save();
      return view(j);
    },
    async verifyJob(jobId: string) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      return view(j);
    },
    async cancelJob(jobId: string, reason: string) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      store.cancel(jobId, reason);
      return view(j);
    },
    async retryJob(jobId: string, taskId: string) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      j.state.set(taskId, "PLANNED");
      store.save();
      return view(j);
    },
    async inspectJob(jobId: string) {
      const j = store.get(jobId);
      if (!j) throw new Error("job_not_found");
      return view(j);
    },
  };
}

export function view(j: StoredJob) {
  return {
    jobId: j.spec.jobId,
    spec: j.spec,
    graph: j.graph,
    dagHash: j.dagHash,
    state: Object.fromEntries(j.state),
    assignments: j.assignments,
    results: j.results,
    verifications: j.verifications,
    receipt: j.receipt,
  };
}

/**
 * Clear per-run artefacts on a stored job so it can be re-played.
 * The DAG hash, compiled graph, and spec are intentionally kept —
 * they're a function of the spec, not the run.
 */
function resetJobState(j: StoredJob): void {
  for (const n of j.graph.nodes) {
    j.state.set(n.taskId, "PLANNED");
  }
  j.assignments.length = 0;
  j.results.length = 0;
  j.verifications.length = 0;
  j.receipt = undefined;
}

/**
 * Build the standard orchestrator hooks (worker / verifier / etc.)
 * shared by `executeJob` and `playJob`. The caller is expected to
 * spread this object and may attach additional hooks (e.g.
 * `onTaskState`) on top.
 */
function defaultHooks(
  j: StoredJob,
  deps: {
    humanApprove: (jobId: string, taskId: string) => Promise<boolean>;
    now: () => number;
  }
) {
  return {
    worker: async (taskId: string) => {
      const output = { costMicrousd: 1n, ok: true };
      return {
        taskId,
        agentId: "agent-1",
        outputHash: contentHash(output),
        output,
        submittedAt: deps.now(),
        verifierKind: "hash" as const,
        verifierNote: "",
      };
    },
    verifier: async (result: TaskResult) => {
      const v = await hashVerifier(result, {
        verifierId: "v1",
        now: deps.now(),
      });
      j.verifications.push(v);
      return { ok: v.verdict === "pass", reason: v.reason };
    },
    humanApprove: (taskId: string) => deps.humanApprove(j.spec.jobId, taskId),
    onAssignment: (a: AssignmentReceipt) => {
      j.assignments.push(a);
    },
  };
}

/**
 * The three demo scenarios supported by `playJob`. Kept narrow on
 * purpose — every scenario has to be 100% deterministic so the
 * dashboard's polling loop can narrate it accurately.
 */
export type PlayScenario = "happy" | "verifier" | "failure";

/**
 * Return the per-scenario hook overrides for `playJob`. Returns an
 * object meant to be spread over `defaultHooks` (so the verifier
 * and assignment-recording still apply). For unknown scenarios we
 * silently fall back to the default happy-path worker.
 */
function scenarioWorkerHooks(
  scenario: PlayScenario,
  deps: { now: () => number }
): Partial<{ worker: (taskId: string) => Promise<TaskResult> }> {
  switch (scenario) {
    case "verifier":
      // t1 returns a perfectly valid result, but t2's worker
      // returns an outputHash that doesn't match its output. The
      // default hashVerifier compares the two and returns
      // {ok:false, reason:"hash_mismatch:…"}, so t2 is marked
      // SUBMITTED, retried 3×, then FAILED; cancelDownstream
      // marks t3 CANCELLED. Final: t1 VERIFIED, t2 FAILED,
      // t3 CANCELLED. This makes the visual signal different from
      // the worker-throw scenario (where t1 is FAILED).
      return {
        worker: async (taskId: string) => {
          const output = { costMicrousd: 1n, ok: true };
          // Intentionally wrong hash for t2 to force verifier
          // disagreement; t1 / t3 use the real hash so they pass.
          const wrongHash = ("0x" + "11".repeat(32)) as Hash;
          return {
            taskId,
            agentId: "agent-1",
            outputHash: taskId === "t2" ? wrongHash : contentHash(output),
            output,
            submittedAt: deps.now(),
            verifierKind: "hash" as const,
            verifierNote: "",
          };
        },
      };
    case "failure":
      // t1's worker always throws. The orchestrator retries up to
      // `maxAttempts` times (default 3), exhausts them, and marks
      // t1 FAILED. cancelDownstream then marks every transitive
      // downstream — t2, t3, t4 — as CANCELLED.
      //
      // This is the "cascading failure" story: the very first task
      // dies, and every dependent is cancelled without ever
      // running. It's visually distinct from the `verifier` scenario
      // (where t2 alone dies and the parallel t3 still runs to
      // completion).
      return {
        worker: async (taskId: string) => {
          if (taskId === "t1") {
            throw new Error("agent-1 unreachable (simulated)");
          }
          const output = { costMicrousd: 1n, ok: true };
          return {
            taskId,
            agentId: "agent-1",
            outputHash: contentHash(output),
            output,
            submittedAt: deps.now(),
            verifierKind: "hash" as const,
            verifierNote: "",
          };
        },
      };
    case "happy":
    default:
      return {};
  }
}

/**
 * Compute and persist the on-chain-equivalent receipt for a finished
 * run. Idempotent — re-running this overwrites the previous receipt.
 */
function finalizeReceipt(
  j: StoredJob,
  r: { results: readonly TaskResult[]; totalSpent: bigint },
  now: () => number
): void {
  const agg = aggregate({
    jobId: j.spec.jobId,
    results: r.results,
    verifications: j.verifications,
  });
  j.receipt = {
    jobId: j.spec.jobId,
    dagHash: j.dagHash,
    assignmentRoot: computeAssignmentRoot(j.assignments),
    resultRoot: computeResultRoot(r.results, j.verifications),
    verificationRoot: agg.verificationRoot,
    completedAt: now(),
    totalSpentMicrousd: r.totalSpent,
    chainId: 688689,
    registryAddress: ("0x" + "44".repeat(20)) as `0x${string}`,
    receiptTxHash: ("0x" + "55".repeat(32)) as Hash,
  };
}
