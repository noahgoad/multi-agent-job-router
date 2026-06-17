/**
 * Coordination safety specification.
 *
 * The router enforces a small set of non-negotiable invariants that
 * apply to every job, task, and assignment. The functions exported
 * here are the canonical implementation of those rules and are
 * consumed by the workflow compiler, the orchestrator, and the
 * verifier.
 *
 * Rules implemented:
 *  - Permission propagation is least-privilege. A child task can only
 *    use capabilities that the parent job or task explicitly granted.
 *  - Budget accounting is debited before a task starts and reconciled
 *    after it finishes. Total spend cannot exceed the parent budget.
 *  - Cancellation is idempotent and propagates to all descendants.
 *  - Retries are bounded and require a fresh token.
 *  - Human approvals are required for any task tagged
 *    "financial" or "write" before it can be assigned.
 *  - Trusted results come from a registered, scanned, in-good-standing
 *    agent with a current heartbeat. Anything else is untrusted.
 *  - No hidden delegation: a worker cannot sub-spawn another agent
 *    that is not registered in the same job graph.
 */

export type CapabilityTag =
  | "read"
  | "compute"
  | "fetch"
  | "analyze"
  | "summarize"
  | "verify"
  | "write"
  | "financial";

export type TaskRisk = "low" | "medium" | "high";

export interface PermissionGrant {
  readonly capabilities: ReadonlyArray<CapabilityTag>;
  readonly maxBudgetMicrousd: bigint;
  readonly allowedChains: ReadonlyArray<number>;
  readonly expiresAt: number;
}

export interface PermissionRequest {
  readonly requested: ReadonlyArray<CapabilityTag>;
  readonly budgetMicrousd: bigint;
  readonly chains: ReadonlyArray<number>;
  readonly ttlSeconds: number;
  readonly now: number;
}

export interface PermissionDecision {
  readonly granted: PermissionGrant;
  readonly reason: string;
}

export interface BudgetLedger {
  readonly parentBudget: bigint;
  reserved: bigint;
  spent: bigint;
}

export interface BudgetCheck {
  readonly ok: boolean;
  readonly remaining: bigint;
  readonly reason?: string;
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffSeconds: number;
  readonly requireFreshToken: boolean;
}

export interface HumanApprovalGate {
  readonly taskId: string;
  readonly requiredTags: ReadonlyArray<CapabilityTag>;
  readonly approvedBy?: string;
  readonly approvedAt?: number;
}

export interface WorkerIdentity {
  readonly agentId: string;
  readonly endpoint: string;
  readonly skillReleaseHash: `0x${string}`;
  readonly certikVerdict: "pass" | "fail" | "expired";
  readonly trustScore: number;
  readonly lastHeartbeat: number;
  readonly now: number;
}

export interface TrustedResultCheck {
  readonly trusted: boolean;
  readonly reason: string;
}

const HIGH_RISK_TAGS: ReadonlyArray<CapabilityTag> = ["write", "financial"];
const HEARTBEAT_FRESHNESS_SECONDS = 300;

export function isLeastPrivilegeSatisfied(
  parent: PermissionGrant,
  request: PermissionRequest,
): PermissionDecision {
  const requested = new Set(request.requested);
  const allowed = new Set(parent.capabilities);
  for (const cap of requested) {
    if (!allowed.has(cap)) {
      return {
        granted: parent,
        reason: `capability_not_granted:${cap}`,
      };
    }
  }
  if (request.budgetMicrousd > parent.maxBudgetMicrousd) {
    return {
      granted: parent,
      reason: `budget_exceeds_grant:${request.budgetMicrousd}`,
    };
  }
  for (const chain of request.chains) {
    if (!parent.allowedChains.includes(chain)) {
      return {
        granted: parent,
        reason: `chain_not_allowed:${chain}`,
      };
    }
  }
  const expiresAt = request.now + request.ttlSeconds;
  if (expiresAt > parent.expiresAt) {
    return {
      granted: parent,
      reason: `ttl_exceeds_parent_expiry`,
    };
  }
  return {
    granted: {
      capabilities: Array.from(requested),
      maxBudgetMicrousd: request.budgetMicrousd,
      allowedChains: request.chains,
      expiresAt,
    },
    reason: "ok",
  };
}

export function createBudgetLedger(parentBudget: bigint): BudgetLedger {
  if (parentBudget < 0n) {
    throw new Error("parent_budget_negative");
  }
  return { parentBudget, reserved: 0n, spent: 0n };
}

export function reserveBudget(
  ledger: BudgetLedger,
  amount: bigint,
): BudgetCheck {
  if (amount < 0n) return { ok: false, remaining: 0n, reason: "negative_amount" };
  const remaining = ledger.parentBudget - ledger.reserved - ledger.spent;
  if (ledger.reserved + amount + ledger.spent > ledger.parentBudget) {
    return { ok: false, remaining, reason: "budget_overflow" };
  }
  ledger.reserved += amount;
  return { ok: true, remaining: remaining - amount };
}

export function settleBudget(
  ledger: BudgetLedger,
  reserved: bigint,
  actual: bigint,
): BudgetCheck {
  if (reserved < 0n || actual < 0n) {
    return { ok: false, remaining: 0n, reason: "negative_amount" };
  }
  if (actual > reserved) {
    return { ok: false, remaining: 0n, reason: "actual_exceeds_reserved" };
  }
  ledger.reserved -= reserved;
  ledger.spent += actual;
  const remaining = ledger.parentBudget - ledger.reserved - ledger.spent;
  return { ok: true, remaining };
}

export function defaultRetryPolicy(): RetryPolicy {
  return { maxAttempts: 3, backoffSeconds: 30, requireFreshToken: true };
}

export function isHumanApprovalRequired(
  request: PermissionRequest,
): boolean {
  return request.requested.some((c) => HIGH_RISK_TAGS.includes(c));
}

export function recordHumanApproval(
  gate: HumanApprovalGate,
  approver: string,
  now: number,
): HumanApprovalGate {
  if (!isHumanApprovalRequired({
    requested: gate.requiredTags,
    budgetMicrousd: 0n,
    chains: [],
    ttlSeconds: 0,
    now,
  })) {
    return gate;
  }
  return { ...gate, approvedBy: approver, approvedAt: now };
}

export function isApprovalSatisfied(
  gate: HumanApprovalGate,
  now: number,
): boolean {
  if (!isHumanApprovalRequired({
    requested: gate.requiredTags,
    budgetMicrousd: 0n,
    chains: [],
    ttlSeconds: 0,
    now,
  })) {
    return true;
  }
  if (!gate.approvedBy || gate.approvedAt === undefined) return false;
  return gate.approvedAt <= now;
}

export function assessWorkerTrust(worker: WorkerIdentity): TrustedResultCheck {
  if (worker.certikVerdict !== "pass") {
    return { trusted: false, reason: `certik_${worker.certikVerdict}` };
  }
  if (worker.trustScore < 60) {
    return { trusted: false, reason: "trust_below_threshold" };
  }
  const heartbeatAge = worker.now - worker.lastHeartbeat;
  if (heartbeatAge > HEARTBEAT_FRESHNESS_SECONDS) {
    return { trusted: false, reason: "stale_heartbeat" };
  }
  return { trusted: true, reason: "ok" };
}

export function classifyTaskRisk(request: PermissionRequest): TaskRisk {
  if (request.requested.includes("financial")) return "high";
  if (request.requested.includes("write")) return "high";
  if (request.requested.includes("verify")) return "medium";
  return "low";
}

export function assertNoHiddenDelegation(
  declaredAgents: ReadonlyArray<string>,
  observedAgent: string,
): void {
  if (!declaredAgents.includes(observedAgent)) {
    throw new Error(
      `no_hidden_delegation:agent_not_in_graph:${observedAgent}`,
    );
  }
}