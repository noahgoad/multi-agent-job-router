import { z } from "zod";
import { contentHash, type Hash } from "@pharos-router/workflow";
import type { TaskResult, VerificationRecord } from "@pharos-router/workflow";

/**
 * Result verifiers.
 *
 * Five verifier kinds are supported:
 *  - `schema`: the result output must validate against a Zod schema.
 *  - `hash`: the result outputHash must match the content hash.
 *  - `deterministic`: a deterministic function is recomputed and
 *    compared to the reported output.
 *  - `transaction`: a Pharos transaction receipt is checked.
 *  - `human`: a human-in-the-loop approval is required.
 *
 * Every verifier returns a `VerificationRecord` (verdict + evidence
 * hash) that the orchestrator persists.
 */

export interface VerifierContext {
  readonly verifierId: string;
  readonly now: number;
}

export type VerifierFn = (
  result: TaskResult,
  ctx: VerifierContext,
) => Promise<VerificationRecord>;

export const schemaVerifier =
  (schema: z.ZodTypeAny): VerifierFn =>
  async (result, ctx) => {
    const parsed = schema.safeParse(result.output);
    const verdict: "pass" | "fail" = parsed.success ? "pass" : "fail";
    return {
      taskId: result.taskId,
      verifierId: ctx.verifierId,
      verdict,
      reason: parsed.success ? "schema_ok" : parsed.error.message,
      evidenceHash: contentHash(parsed),
      verifiedAt: ctx.now,
    };
  };

export const hashVerifier: VerifierFn = async (result, ctx) => {
  const expected = contentHash(result.output) as Hash;
  const ok = expected === result.outputHash;
  return {
    taskId: result.taskId,
    verifierId: ctx.verifierId,
    verdict: ok ? "pass" : "fail",
    reason: ok ? "hash_match" : `hash_mismatch:expected=${expected}`,
    evidenceHash: expected,
    verifiedAt: ctx.now,
  };
};

export interface DeterministicSpec<T> {
  readonly key: keyof T & string;
  readonly fn: (output: T) => unknown;
}

/**
 * Deterministic verifier: applies `fn` to the output and checks
 * that the value stored under `key` equals the recomputed value.
 * The check is field-based so that non-deterministic fields
 * (timestamps, nonces) do not cause spurious failures.
 */
export const deterministicVerifier =
  <T extends Record<string, unknown>>(spec: DeterministicSpec<T>): VerifierFn =>
  async (result, ctx) => {
    const out = result.output as T;
    let recomputed: unknown;
    try {
      recomputed = spec.fn(out);
    } catch (e) {
      return {
        taskId: result.taskId,
        verifierId: ctx.verifierId,
        verdict: "fail",
        reason: `deterministic_throw:${(e as Error).message}`,
        evidenceHash: contentHash({ error: (e as Error).message }),
        verifiedAt: ctx.now,
      };
    }
    const reported = out[spec.key];
    const ok =
      contentHash(recomputed) === contentHash(reported);
    return {
      taskId: result.taskId,
      verifierId: ctx.verifierId,
      verdict: ok ? "pass" : "fail",
      reason: ok ? "deterministic_match" : "deterministic_mismatch",
      evidenceHash: contentHash(recomputed),
      verifiedAt: ctx.now,
    };
  };

export interface TxCheck {
  readonly txHash: Hash;
  readonly chainId: number;
  readonly expectedTo?: `0x${string}`;
  readonly status: "success" | "reverted" | "unknown";
}

export type TxLookup = (txHash: Hash) => Promise<TxCheck>;

export const transactionVerifier =
  (lookup: TxLookup, chainId: number): VerifierFn =>
  async (result, ctx) => {
    const txHash = (result.output as { txHash?: Hash })?.txHash;
    if (!txHash) {
      return {
        taskId: result.taskId,
        verifierId: ctx.verifierId,
        verdict: "fail",
        reason: "missing_tx_hash",
        evidenceHash: contentHash({ result: result.output }),
        verifiedAt: ctx.now,
      };
    }
    const check = await lookup(txHash);
    const ok = check.status === "success" && check.chainId === chainId;
    return {
      taskId: result.taskId,
      verifierId: ctx.verifierId,
      verdict: ok ? "pass" : "fail",
      reason: ok ? "tx_success" : `tx_${check.status}`,
      evidenceHash: contentHash(check),
      verifiedAt: ctx.now,
    };
  };

export const humanVerifier =
  (ask: (result: TaskResult) => Promise<{ ok: boolean; reason: string }>): VerifierFn =>
  async (result, ctx) => {
    const r = await ask(result);
    return {
      taskId: result.taskId,
      verifierId: ctx.verifierId,
      verdict: r.ok ? "pass" : "fail",
      reason: r.reason,
      evidenceHash: contentHash({ human: r }),
      verifiedAt: ctx.now,
    };
  };