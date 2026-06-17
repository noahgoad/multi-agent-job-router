import { describe, expect, it } from "vitest";
import {
  assertNoHiddenDelegation,
  assessWorkerTrust,
  classifyTaskRisk,
  createBudgetLedger,
  defaultRetryPolicy,
  isApprovalSatisfied,
  isHumanApprovalRequired,
  isLeastPrivilegeSatisfied,
  recordHumanApproval,
  reserveBudget,
  settleBudget,
} from "../src/safety.js";

describe("policy/safety", () => {
  it("grants least privilege for a subset request", () => {
    const parent = {
      capabilities: ["read", "compute", "financial"] as const,
      maxBudgetMicrousd: 1_000_000n,
      allowedChains: [688689],
      expiresAt: 2_000,
    };
    const req = {
      requested: ["read", "compute"],
      budgetMicrousd: 100_000n,
      chains: [688689],
      ttlSeconds: 60,
      now: 1_000,
    };
    const d = isLeastPrivilegeSatisfied(parent, req);
    expect(d.reason).toBe("ok");
    expect(d.granted.capabilities).toEqual(["read", "compute"]);
  });

  it("rejects capability not granted", () => {
    const parent = {
      capabilities: ["read"] as const,
      maxBudgetMicrousd: 1_000n,
      allowedChains: [688689],
      expiresAt: 2_000,
    };
    const req = {
      requested: ["financial"],
      budgetMicrousd: 1n,
      chains: [688689],
      ttlSeconds: 1,
      now: 1_000,
    };
    expect(isLeastPrivilegeSatisfied(parent, req).reason).toMatch(
      /capability_not_granted/,
    );
  });

  it("rejects budgets larger than the grant", () => {
    const parent = {
      capabilities: ["compute"] as const,
      maxBudgetMicrousd: 10n,
      allowedChains: [688689],
      expiresAt: 2_000,
    };
    const req = {
      requested: ["compute"],
      budgetMicrousd: 100n,
      chains: [688689],
      ttlSeconds: 1,
      now: 1_000,
    };
    expect(isLeastPrivilegeSatisfied(parent, req).reason).toMatch(
      /budget_exceeds_grant/,
    );
  });

  it("rejects chains outside the grant", () => {
    const parent = {
      capabilities: ["compute"] as const,
      maxBudgetMicrousd: 1_000n,
      allowedChains: [1],
      expiresAt: 2_000,
    };
    const req = {
      requested: ["compute"],
      budgetMicrousd: 1n,
      chains: [688689],
      ttlSeconds: 1,
      now: 1_000,
    };
    expect(isLeastPrivilegeSatisfied(parent, req).reason).toMatch(
      /chain_not_allowed/,
    );
  });

  it("enforces budget reservation and settlement", () => {
    const l = createBudgetLedger(1_000n);
    const r = reserveBudget(l, 400n);
    expect(r.ok).toBe(true);
    expect(r.remaining).toBe(600n);
    const r2 = reserveBudget(l, 700n);
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe("budget_overflow");
    const s = settleBudget(l, 400n, 350n);
    expect(s.ok).toBe(true);
    expect(s.remaining).toBe(650n);
  });

  it("requires human approval for financial or write tasks", () => {
    expect(
      isHumanApprovalRequired({
        requested: ["compute"],
        budgetMicrousd: 0n,
        chains: [],
        ttlSeconds: 0,
        now: 0,
      }),
    ).toBe(false);
    expect(
      isHumanApprovalRequired({
        requested: ["financial"],
        budgetMicrousd: 0n,
        chains: [],
        ttlSeconds: 0,
        now: 0,
      }),
    ).toBe(true);
    expect(
      isHumanApprovalRequired({
        requested: ["write"],
        budgetMicrousd: 0n,
        chains: [],
        ttlSeconds: 0,
        now: 0,
      }),
    ).toBe(true);
  });

  it("records and validates human approval", () => {
    const gate = { taskId: "t1", requiredTags: ["financial"] as const };
    const approved = recordHumanApproval(gate, "alice", 100);
    expect(isApprovalSatisfied(approved, 100)).toBe(true);
    expect(isApprovalSatisfied(gate, 100)).toBe(false);
  });

  it("rejects stale or untrusted workers", () => {
    const stale = assessWorkerTrust({
      agentId: "a1",
      endpoint: "https://a",
      skillReleaseHash: "0x" + "11".repeat(32) as `0x${string}`,
      certikVerdict: "pass",
      trustScore: 90,
      lastHeartbeat: 0,
      now: 1_000,
    });
    expect(stale.trusted).toBe(false);
    expect(stale.reason).toBe("stale_heartbeat");

    const untrusted = assessWorkerTrust({
      agentId: "a1",
      endpoint: "https://a",
      skillReleaseHash: "0x" + "11".repeat(32) as `0x${string}`,
      certikVerdict: "fail",
      trustScore: 90,
      lastHeartbeat: 1_000,
      now: 1_000,
    });
    expect(untrusted.reason).toBe("certik_fail");
  });

  it("classifies task risk", () => {
    expect(
      classifyTaskRisk({
        requested: ["compute"],
        budgetMicrousd: 0n,
        chains: [],
        ttlSeconds: 0,
        now: 0,
      }),
    ).toBe("low");
    expect(
      classifyTaskRisk({
        requested: ["verify"],
        budgetMicrousd: 0n,
        chains: [],
        ttlSeconds: 0,
        now: 0,
      }),
    ).toBe("medium");
    expect(
      classifyTaskRisk({
        requested: ["financial"],
        budgetMicrousd: 0n,
        chains: [],
        ttlSeconds: 0,
        now: 0,
      }),
    ).toBe("high");
  });

  it("enforces no hidden delegation", () => {
    expect(() => assertNoHiddenDelegation(["a", "b"], "b")).not.toThrow();
    expect(() => assertNoHiddenDelegation(["a"], "x")).toThrow(
      /no_hidden_delegation/,
    );
  });

  it("returns a default retry policy", () => {
    const p = defaultRetryPolicy();
    expect(p.maxAttempts).toBeGreaterThan(0);
    expect(p.requireFreshToken).toBe(true);
  });
});