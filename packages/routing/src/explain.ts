import type { Hash } from "@pharos-router/workflow";

/**
 * Routing weights and explanation trace.
 *
 * The routing engine produces a deterministic weighted score for
 * every candidate agent and a human-readable explanation of how the
 * weights were applied. The weights and the explanation are part of
 * the assignment receipt so the user can audit every routing
 * decision.
 */

export interface RoutingWeights {
  readonly capabilityFit: number;
  readonly trust: number;
  readonly cost: number;
  readonly latency: number;
  readonly availability: number;
  readonly priorSuccess: number;
}

export const DEFAULT_WEIGHTS: RoutingWeights = {
  capabilityFit: 35,
  trust: 25,
  cost: 15,
  latency: 10,
  availability: 10,
  priorSuccess: 5,
};

export interface ScoreBreakdown {
  readonly agentId: string;
  readonly totals: {
    readonly capabilityFit: number;
    readonly trust: number;
    readonly cost: number;
    readonly latency: number;
    readonly availability: number;
    readonly priorSuccess: number;
  };
  readonly weighted: number;
}

export interface RoutingExplanation {
  readonly weights: RoutingWeights;
  readonly candidates: ReadonlyArray<ScoreBreakdown>;
  readonly notes: ReadonlyArray<string>;
  readonly decisionHash: Hash;
}