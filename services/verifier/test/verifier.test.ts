import { describe, expect, it } from "vitest";
import { z } from "zod";
import { contentHash, hashString, type Hash, type TaskResult } from "@pharos-router/workflow";
import {
  deterministicVerifier,
  hashVerifier,
  humanVerifier,
  schemaVerifier,
  transactionVerifier,
} from "../src/verifiers.js";
import { aggregate } from "../src/aggregator.js";

function hash(s: string): Hash {
  return hashString(s);
}

function result(output: unknown): TaskResult {
  return {
    taskId: "t1",
    agentId: "a1",
    outputHash: hash("placeholder"),
    output,
    submittedAt: 1,
    verifierKind: "hash",
    verifierNote: "",
  };
}

const ctx = { verifierId: "v1", now: 1 };

describe("verifier/verifiers", () => {
  it("hash verifier passes when outputHash matches", async () => {
    const r = result({ ok: true });
    r.outputHash = contentHash(r.output) as Hash;
    const v = await hashVerifier(r, ctx);
    expect(v.verdict).toBe("pass");
  });
  it("hash verifier fails on mismatch", async () => {
    const r = result({ ok: true });
    r.outputHash = hash("wrong") as Hash;
    const v = await hashVerifier(r, ctx);
    expect(v.verdict).toBe("fail");
  });
  it("schema verifier validates the output", async () => {
    const schema = z.object({ ok: z.boolean() });
    const ok = await schemaVerifier(schema)(result({ ok: true }), ctx);
    expect(ok.verdict).toBe("pass");
    const bad = await schemaVerifier(schema)(result({ ok: "yes" }), ctx);
    expect(bad.verdict).toBe("fail");
  });
  it("deterministic verifier recomputes and compares", async () => {
    const v = deterministicVerifier<{ x: number; doubled: number }>({
      key: "doubled",
      fn: (o) => o.x * 2,
    });
    const pass = await v(result({ x: 2, doubled: 4 }), ctx);
    expect(pass.verdict).toBe("pass");
    const fail = await v(result({ x: 2, doubled: 5 }), ctx);
    expect(fail.verdict).toBe("fail");
  });
  it("transaction verifier checks chain id and status", async () => {
    const lookup = async (h: Hash) => ({
      txHash: h,
      chainId: 688689,
      status: "success" as const,
    });
    const tv = transactionVerifier(lookup, 688689);
    const r = result({ txHash: hash("tx") as Hash });
    const v = await tv(r, ctx);
    expect(v.verdict).toBe("pass");
  });
  it("transaction verifier fails when status is reverted", async () => {
    const lookup = async (h: Hash) => ({
      txHash: h,
      chainId: 688689,
      status: "reverted" as const,
    });
    const tv = transactionVerifier(lookup, 688689);
    const r = result({ txHash: hash("tx") as Hash });
    const v = await tv(r, ctx);
    expect(v.verdict).toBe("fail");
  });
  it("human verifier records human verdict", async () => {
    const v = humanVerifier(async () => ({ ok: false, reason: "looks wrong" }));
    const r = await v(result({ ok: true }), ctx);
    expect(r.verdict).toBe("fail");
    expect(r.reason).toBe("looks wrong");
  });
});

describe("verifier/aggregator", () => {
  it("aggregates only verified results", () => {
    const r1 = { ...result({ ok: true }), taskId: "t1" };
    const r2 = { ...result({ ok: true }), taskId: "t2" };
    const v1 = {
      taskId: "t1",
      verifierId: "v",
      verdict: "pass" as const,
      reason: "",
      evidenceHash: hash("e1"),
      verifiedAt: 1,
    };
    const v2 = { ...v1, taskId: "t2", verdict: "fail" as const };
    const agg = aggregate({ jobId: "j", results: [r1, r2], verifications: [v1, v2] });
    expect(agg.verifiedTaskIds).toEqual(["t1"]);
    expect(agg.disagreement).toHaveLength(1);
    expect(agg.resultRoot.startsWith("0x")).toBe(true);
  });
});