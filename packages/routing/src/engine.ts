import { contentHash, type Hash } from "@pharos-router/workflow";
import type { AgentRecord } from "@pharos-router/registry";
import {
  DEFAULT_WEIGHTS,
  type RoutingWeights,
  type ScoreBreakdown,
  type RoutingExplanation,
} from "./explain.js";

/**
 * Routing engine.
 *
 * Given a set of eligible agents and a task requirement, the engine
 * produces a deterministic weighted score, an explanation, and a
 * selected agent. The selection is diversity-aware: if a verifier
 * role has already been assigned to an agent in the same job, that
 * agent is excluded from worker selection (and vice versa).
 */

export interface RoutingRequirement {
  readonly jobId: string;
  readonly taskId: string;
  readonly capability: string;
  readonly budgetMicrousd: bigint;
  readonly maxLatencyMs?: number;
  readonly requireVerifiers?: number;
}

export interface RoutingCandidate {
  readonly agent: AgentRecord;
  readonly estimatedLatencyMs: number;
  readonly successRate: number;
  readonly availabilityScore: number;
}

export interface RoutingDecision {
  readonly selected: RoutingCandidate | null;
  readonly explanation: RoutingExplanation;
}

export interface RoutingContext {
  readonly weights?: Partial<RoutingWeights>;
  readonly now: number;
  readonly alreadyAssigned: ReadonlyArray<string>;
  readonly role: "worker" | "verifier";
}

export class RoutingError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "RoutingError";
  }
}

export function scoreCandidate(
  req: RoutingRequirement,
  candidate: RoutingCandidate,
  weights: RoutingWeights,
): ScoreBreakdown {
  const fit = candidate.agent.capabilities.includes(req.capability) ? 100 : 0;
  const trust = clamp(candidate.agent.trustScore, 0, 100);
  const cost = scoreCost(req.budgetMicrousd, candidate.agent.pricingMicrousd);
  const latency = scoreLatency(req.maxLatencyMs, candidate.estimatedLatencyMs);
  const avail = clamp(candidate.availabilityScore, 0, 100);
  const success = clamp(Math.round(candidate.successRate * 100), 0, 100);
  const totals = {
    capabilityFit: fit,
    trust,
    cost,
    latency,
    availability: avail,
    priorSuccess: success,
  };
  const weighted =
    (fit * weights.capabilityFit +
      trust * weights.trust +
      cost * weights.cost +
      latency * weights.latency +
      avail * weights.availability +
      success * weights.priorSuccess) /
    100;
  return { agentId: candidate.agent.agentId, totals, weighted };
}

export function selectCandidate(
  req: RoutingRequirement,
  candidates: ReadonlyArray<RoutingCandidate>,
  context: RoutingContext,
): RoutingDecision {
  const weights = { ...DEFAULT_WEIGHTS, ...context.weights };
  // Diversity: the same agent is excluded from verifier selection
  // when it has already been assigned a worker role in the same
  // job, and vice versa. The same worker may be reused across
  // multiple worker tasks.
  const diversityFilter = (c: RoutingCandidate): boolean => {
    if (
      context.alreadyAssigned.length > 0 &&
      context.role !== "worker"
    ) {
      return !context.alreadyAssigned.includes(c.agent.agentId);
    }
    return true;
  };
  const filtered = candidates.filter(diversityFilter);
  const breakdowns = filtered.map((c) =>
    scoreCandidate(req, c, weights),
  );
  const sorted = [...breakdowns].sort((a, b) => b.weighted - a.weighted);
  const notes: string[] = [];
  if (filtered.length === 0) {
    notes.push("no_candidates_after_diversity");
  }
  if (
    req.requireVerifiers !== undefined &&
    context.alreadyAssigned.length < req.requireVerifiers
  ) {
    notes.push(`need_${req.requireVerifiers}_distinct_verifiers`);
  }
  const decisionHash = contentHash({
    req,
    weights,
    ranked: sorted.map((s) => ({ agentId: s.agentId, score: s.weighted })),
  }) as Hash;
  const explanation: RoutingExplanation = {
    weights,
    candidates: sorted,
    notes,
    decisionHash,
  };
  if (sorted.length === 0) {
    return { selected: null, explanation };
  }
  const top = sorted[0]!;
  const topCandidate = filtered.find((c) => c.agent.agentId === top.agentId)!;
  return { selected: topCandidate, explanation };
}

function scoreCost(budget: bigint, price: bigint): number {
  if (price > budget) return 0;
  if (budget === 0n) return 0;
  const ratio = Number(((price * 100n) / budget).toString());
  return clamp(100 - ratio, 0, 100);
}

function scoreLatency(max: number | undefined, observed: number): number {
  if (max === undefined || max <= 0) return 100;
  if (observed >= max) return 0;
  return clamp(100 - Math.round((observed / max) * 100), 0, 100);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}