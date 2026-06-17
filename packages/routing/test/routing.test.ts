import { describe, expect, it } from "vitest";
import { hashString, type Hash } from "@pharos-router/workflow";
import type { AgentRecord } from "@pharos-router/registry";
import {
  scoreCandidate,
  selectCandidate,
  type RoutingCandidate,
  type RoutingRequirement,
} from "../src/engine.js";
import { DEFAULT_WEIGHTS } from "../src/explain.js";

function hash(s: string): Hash {
  return hashString(s);
}

function agent(extra: Partial<AgentRecord>): AgentRecord {
  return {
    agentId: "a",
    displayName: "a",
    endpoint: "https://a.example",
    pricingMicrousd: 0n,
    trustScore: 80,
    capabilities: ["summarize"],
    activeSkillRelease: hash("x"),
    lastHeartbeat: 0,
    registeredAt: 0,
    ...extra,
  };
}

function candidate(extra: Partial<RoutingCandidate>): RoutingCandidate {
  return {
    agent: agent({}),
    estimatedLatencyMs: 100,
    successRate: 0.95,
    availabilityScore: 80,
    ...extra,
  };
}

const req: RoutingRequirement = {
  jobId: "j",
  taskId: "t",
  capability: "summarize",
  budgetMicrousd: 10_000n,
  maxLatencyMs: 1_000,
};

describe("routing/engine", () => {
  it("scores a perfect candidate highest", () => {
    const c = candidate({
      agent: agent({ capabilities: ["summarize"], trustScore: 100, pricingMicrousd: 0n }),
      estimatedLatencyMs: 0,
      successRate: 1,
      availabilityScore: 100,
    });
    const s = scoreCandidate(req, c, DEFAULT_WEIGHTS);
    expect(s.weighted).toBe(100);
  });

  it("rejects an agent missing the required capability", () => {
    const c = candidate({
      agent: agent({ capabilities: ["read"], trustScore: 100 }),
    });
    const s = scoreCandidate(req, c, DEFAULT_WEIGHTS);
    expect(s.totals.capabilityFit).toBe(0);
  });

  it("scores cost zero when price exceeds budget", () => {
    const c = candidate({
      agent: agent({ pricingMicrousd: 999_999n }),
    });
    const s = scoreCandidate(req, c, DEFAULT_WEIGHTS);
    expect(s.totals.cost).toBe(0);
  });

  it("selects the highest-scored candidate and returns explanation", () => {
    const a = candidate({
      agent: agent({ agentId: "a1", trustScore: 80 }),
      estimatedLatencyMs: 800,
      successRate: 0.8,
    });
    const b = candidate({
      agent: agent({ agentId: "a2", trustScore: 95 }),
      estimatedLatencyMs: 200,
      successRate: 0.97,
      availabilityScore: 90,
    });
    const decision = selectCandidate(req, [a, b], {
      now: 0,
      alreadyAssigned: [],
      role: "verifier",
    });
    expect(decision.selected?.agent.agentId).toBe("a2");
    expect(decision.explanation.candidates[0]?.agentId).toBe("a2");
    expect(decision.explanation.decisionHash.startsWith("0x")).toBe(true);
  });

  it("enforces diversity: excludes already-assigned workers", () => {
    const a = candidate({ agent: agent({ agentId: "a1" }) });
    const b = candidate({ agent: agent({ agentId: "a2" }) });
    const decision = selectCandidate(req, [a, b], {
      now: 0,
      alreadyAssigned: ["a1"],
      role: "verifier",
    });
    expect(decision.selected?.agent.agentId).toBe("a2");
  });

  it("returns null selection when all candidates are filtered out", () => {
    const a = candidate({ agent: agent({ agentId: "a1" }) });
    const decision = selectCandidate(req, [a], {
      now: 0,
      alreadyAssigned: ["a1"],
      role: "verifier",
    });
    expect(decision.selected).toBeNull();
    expect(decision.explanation.notes).toContain("no_candidates_after_diversity");
  });
});
