import { contentHash, hashString, type Hash } from "@pharos-router/workflow";
import {
  agentRecordSchema,
  heartbeatSchema,
  skillReleaseSchema,
  type AgentRecord,
  type Heartbeat,
  type SkillRelease,
} from "./records.js";

/**
 * Agent and skill registry.
 *
 * - Skill releases are keyed by `(skillId, version)`. The release hash
 *   is the content hash of the release manifest. Releases with a
 *   non-pass CertiK verdict or an expired `expiresAt` are not eligible.
 * - Agents are keyed by `agentId`. The agent's active skill release
 *   hash is checked at lookup time; a failing or expired release
 *   disqualifies the agent.
 * - Heartbeats must reference the agent's currently registered
 *   endpoint; an endpoint mismatch is rejected (this prevents
 *   endpoint substitution attacks).
 */

export interface RegistryQuery {
  readonly capability?: string;
  readonly minTrust?: number;
  readonly now: number;
}

export class RegistryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

export class AgentSkillRegistry {
  private readonly agents = new Map<string, AgentRecord>();
  private readonly skills = new Map<string, SkillRelease>();
  private readonly heartbeats = new Map<string, Heartbeat>();
  private readonly endpoints = new Map<string, string>();

  registerSkill(release: SkillRelease): Hash {
    const parsed = skillReleaseSchema.parse(release);
    // The release hash is the content hash of the manifest *without*
    // its own releaseHash field. This avoids the chicken-and-egg
    // problem where a self-referential hash can never match.
    const { releaseHash: _omit, ...body } = parsed;
    const hash = contentHash(body) as Hash;
    if (parsed.releaseHash !== hash) {
      throw new RegistryError(
        "release hash does not match manifest content",
        "release_hash_mismatch",
      );
    }
    const key = `${parsed.skillId}@${parsed.version}`;
    if (this.skills.has(key)) {
      throw new RegistryError(
        `skill ${key} already registered`,
        "duplicate",
      );
    }
    if (parsed.expiresAt <= parsed.certikVerdictAt) {
      throw new RegistryError(
        "release expiry predates certik verdict",
        "invalid_release_window",
      );
    }
    this.skills.set(key, parsed);
    return hash;
  }

  getSkill(skillId: string, version: string): SkillRelease | undefined {
    return this.skills.get(`${skillId}@${version}`);
  }

  registerAgent(agent: AgentRecord): void {
    const parsed = agentRecordSchema.parse(agent);
    if (this.agents.has(parsed.agentId)) {
      throw new RegistryError(
        `agent ${parsed.agentId} already registered`,
        "duplicate",
      );
    }
    this.agents.set(parsed.agentId, parsed);
    this.endpoints.set(parsed.agentId, parsed.endpoint);
  }

  updateAgentSkill(agentId: string, releaseHash: Hash): void {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new RegistryError(`agent ${agentId} not found`, "agent_not_found");
    }
    this.agents.set(agentId, { ...agent, activeSkillRelease: releaseHash });
  }

  recordHeartbeat(beat: Heartbeat): void {
    const parsed = heartbeatSchema.parse(beat);
    const agent = this.agents.get(parsed.agentId);
    if (!agent) {
      throw new RegistryError(
        `agent ${parsed.agentId} not registered`,
        "agent_not_found",
      );
    }
    if (agent.endpoint !== parsed.endpoint) {
      throw new RegistryError(
        `endpoint mismatch for ${parsed.agentId}`,
        "endpoint_mismatch",
      );
    }
    this.heartbeats.set(parsed.agentId, parsed);
    this.agents.set(parsed.agentId, {
      ...agent,
      lastHeartbeat: parsed.issuedAt,
    });
  }

  isEligible(agentId: string, now: number): { ok: boolean; reason: string } {
    const agent = this.agents.get(agentId);
    if (!agent) return { ok: false, reason: "agent_not_found" };
    const release = [...this.skills.values()].find(
      (r) => r.releaseHash === agent.activeSkillRelease,
    );
    if (!release) return { ok: false, reason: "skill_not_found" };
    if (release.certikVerdict !== "pass")
      return { ok: false, reason: "failed_verdict" };
    if (release.expiresAt <= now) return { ok: false, reason: "expired_release" };
    const beat = this.heartbeats.get(agentId);
    if (!beat) return { ok: false, reason: "stale_heartbeat" };
    if (now - beat.issuedAt > 300)
      return { ok: false, reason: "stale_heartbeat" };
    return { ok: true, reason: "ok" };
  }

  query(q: RegistryQuery): AgentRecord[] {
    const out: AgentRecord[] = [];
    for (const a of this.agents.values()) {
      if (q.capability && !a.capabilities.includes(q.capability)) continue;
      if (q.minTrust !== undefined && a.trustScore < q.minTrust) continue;
      if (!this.isEligible(a.agentId, q.now).ok) continue;
      out.push(a);
    }
    return out;
  }

  size(): { agents: number; skills: number } {
    return { agents: this.agents.size, skills: this.skills.size };
  }

  static fakeReleaseHash(seed: string): Hash {
    return hashString("release:" + seed);
  }
}