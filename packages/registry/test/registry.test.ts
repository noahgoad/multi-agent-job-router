import { describe, expect, it } from "vitest";
import { contentHash, hashString, type Hash } from "@pharos-router/workflow";
import {
  AgentSkillRegistry,
  RegistryError,
} from "../src/agents.js";
import type { AgentRecord, SkillRelease } from "../src/records.js";

function hash(s: string): Hash {
  return hashString(s);
}

function release(extra: Partial<SkillRelease> = {}): SkillRelease {
  const base: SkillRelease = {
    skillId: "summarize",
    version: "1.0.0",
    releaseHash: ("0x" + "00".repeat(32)) as Hash,
    imageDigest: "sha256:abc",
    publishedAt: 1_000,
    expiresAt: 1_000_000,
    capabilities: ["summarize", "read"],
    certikVerdict: "pass",
    certikVerdictAt: 1_000,
    certikReportUrl: "https://certik.example/report/1",
    ...extra,
  };
  const { releaseHash: _omit, ...body } = base;
  base.releaseHash = contentHash(body);
  return base;
}

function agent(extra: Partial<AgentRecord> = {}): AgentRecord {
  return {
    agentId: "agent-1",
    displayName: "Agent 1",
    endpoint: "https://agent1.example/rpc",
    pricingMicrousd: 1_000n,
    trustScore: 80,
    capabilities: ["summarize", "read"],
    activeSkillRelease: hash("placeholder"),
    lastHeartbeat: 1_000,
    registeredAt: 1_000,
    ...extra,
  };
}

describe("registry/agents", () => {
  it("registers a skill release and rejects duplicates", () => {
    const r = new AgentSkillRegistry();
    const sk = release();
    r.registerSkill(sk);
    expect(() => r.registerSkill(sk)).toThrowError(RegistryError);
  });

  it("rejects a release whose hash does not match the manifest", () => {
    const r = new AgentSkillRegistry();
    const sk = release();
    sk.releaseHash = hash("not-the-content");
    expect(() => r.registerSkill(sk)).toThrow(/release hash does not match/);
  });

  it("releases with failed or expired verdicts are ineligible", () => {
    const r = new AgentSkillRegistry();
    const sk = release({ certikVerdict: "fail" });

    r.registerSkill(sk);
    const a = agent({ activeSkillRelease: sk.releaseHash });
    r.registerAgent(a);
    r.recordHeartbeat({
      agentId: a.agentId,
      endpoint: a.endpoint,
      issuedAt: 1_000,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    const e = r.isEligible(a.agentId, 1_500);
    expect(e.ok).toBe(false);
    expect(e.reason).toBe("failed_verdict");
  });

  it("releases past expiresAt are ineligible", () => {
    const r = new AgentSkillRegistry();
    const sk = release({ expiresAt: 2_000 });

    r.registerSkill(sk);
    const a = agent({ activeSkillRelease: sk.releaseHash });
    r.registerAgent(a);
    r.recordHeartbeat({
      agentId: a.agentId,
      endpoint: a.endpoint,
      issuedAt: 1_000,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    const e = r.isEligible(a.agentId, 2_500);
    expect(e.reason).toBe("expired_release");
  });

  it("rejects heartbeats with endpoint substitution", () => {
    const r = new AgentSkillRegistry();
    const a = agent();
    r.registerAgent(a);
    expect(() =>
      r.recordHeartbeat({
        agentId: a.agentId,
        endpoint: "https://evil.example/rpc",
        issuedAt: 1_000,
        nonce: "abcd1234",
        signature: hash("sig"),
      }),
    ).toThrow(/endpoint mismatch/);
  });

  it("queries agents by capability and trust", () => {
    const r = new AgentSkillRegistry();
    const sk1 = release({ skillId: "summarize" });

    r.registerSkill(sk1);
    const sk2 = release({ skillId: "analyze" });

    r.registerSkill(sk2);
    const a1 = agent({
      agentId: "a1",
      activeSkillRelease: sk1.releaseHash,
      capabilities: ["summarize", "read"],
      trustScore: 70,
    });
    const a2 = agent({
      agentId: "a2",
      endpoint: "https://agent2.example/rpc",
      activeSkillRelease: sk2.releaseHash,
      capabilities: ["analyze", "read"],
      trustScore: 90,
    });
    r.registerAgent(a1);
    r.registerAgent(a2);
    r.recordHeartbeat({
      agentId: a1.agentId,
      endpoint: a1.endpoint,
      issuedAt: 1_000,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    r.recordHeartbeat({
      agentId: a2.agentId,
      endpoint: a2.endpoint,
      issuedAt: 1_000,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    const only = r.query({ capability: "analyze", minTrust: 80, now: 1_050 });
    expect(only.map((a) => a.agentId)).toEqual(["a2"]);
  });

  // Regression: a heartbeat refresh must keep the agent eligible.
  // The demo `main.ts` used to call `registerAgent` + `recordHeartbeat`
  // every 60s, but `registerAgent` is non-idempotent and throws on
  // duplicate — so every periodic refresh was silently swallowed by
  // the try/catch and the heartbeat's `issuedAt` never advanced. After
  // 300s the agent went stale and the orchestrator's routing layer
  // emitted "no eligible agent", causing every job to fail with
  // "t1 FAILED, downstream CANCELLED" on long-lived dev servers.
  it("heartbeat refresh keeps an agent eligible past the 300s window", () => {
    const r = new AgentSkillRegistry();
    const sk = release();
    r.registerSkill(sk);
    const a = agent({ activeSkillRelease: sk.releaseHash });
    r.registerAgent(a);
    // Initial heartbeat at t=1000.
    r.recordHeartbeat({
      agentId: a.agentId,
      endpoint: a.endpoint,
      issuedAt: 1_000,
      nonce: "demoNonce",
      signature: hash("sig"),
    });
    // At t=1100 the heartbeat is still fresh (100s < 300s).
    expect(r.isEligible(a.agentId, 1_100).ok).toBe(true);
    // At t=1400 the original heartbeat is stale (>300s old).
    expect(r.isEligible(a.agentId, 1_400).ok).toBe(false);
    expect(r.isEligible(a.agentId, 1_400).reason).toBe("stale_heartbeat");
    // A second heartbeat (without re-registering the agent) at t=1400
    // brings the agent back into the eligible window — this is the
    // exact pattern the demo heartbeat refresh needs to use.
    r.recordHeartbeat({
      agentId: a.agentId,
      endpoint: a.endpoint,
      issuedAt: 1_400,
      nonce: "demoNonce",
      signature: hash("sig"),
    });
    expect(r.isEligible(a.agentId, 1_500).ok).toBe(true);
    // And `query` (which the orchestrator uses to find candidates)
    // returns the agent again.
    expect(
      r.query({ capability: "summarize", now: 1_500 }).map((x) => x.agentId),
    ).toEqual([a.agentId]);
  });
});
