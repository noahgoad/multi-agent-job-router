import {
  combineHashes,
  contentHash,
  type Hash,
} from "@pharos-router/workflow";
import type {
  TaskResult,
  VerificationRecord,
} from "@pharos-router/workflow";

/**
 * Result aggregator.
 *
 * The aggregator only counts results whose `VerificationRecord` has
 * `verdict === "pass"`. Disagreement is recorded as a separate
 * evidence blob; the result root is the keccak fold of the verified
 * results only.
 */

export interface AggregationInput {
  readonly jobId: string;
  readonly results: ReadonlyArray<TaskResult>;
  readonly verifications: ReadonlyArray<VerificationRecord>;
}

export interface AggregatedReceipt {
  readonly jobId: string;
  readonly resultRoot: Hash;
  readonly verificationRoot: Hash;
  readonly disagreement: ReadonlyArray<VerificationRecord>;
  readonly verifiedTaskIds: ReadonlyArray<string>;
}

export function aggregate(input: AggregationInput): AggregatedReceipt {
  const pass = new Set(
    input.verifications.filter((v) => v.verdict === "pass").map((v) => v.taskId),
  );
  const disagreement = input.verifications.filter(
    (v) => v.verdict === "fail",
  );
  const verified = input.results.filter((r) => pass.has(r.taskId));
  const resultHashes = verified
    .map((r) => contentHash(r))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const verificationHashes = input.verifications
    .map((v) => contentHash(v))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return {
    jobId: input.jobId,
    resultRoot: combineHashes(...resultHashes),
    verificationRoot: combineHashes(...verificationHashes),
    disagreement,
    verifiedTaskIds: [...pass].sort(),
  };
}