import { expect } from "chai";
import { describe, it } from "mocha";
import { keccak256, stringToBytes, type Hash } from "viem";
function hash(s: string): Hash {
  return keccak256(stringToBytes(s));
}
import {
  ATLANTIC_CHAIN_ID,
  computeAssignmentRoot,
  computeResultRoot,
  PharosAtlanticClient,
} from "../src/atlantic.js";

describe("contracts/atlantic", () => {
  it("enforces chain id 688689", () => {
    expect(
      () =>
        new PharosAtlanticClient({
          rpcUrl: "https://atlantic-rpc.pharosnetwork.xyz",
          chainId: 1,
          registryAddress: "0x" + "44".repeat(20),
          deployerPrivateKey: "0x" + "11".repeat(32),
        })
    ).to.throw(/atlantic_chain_id_mismatch/);
  });

  it("computes deterministic assignment and result roots", () => {
    const a = {
      taskId: "t1",
      agentId: "a1",
      skillReleaseHash: hash("sr"),
      score: 80,
      assignedAt: 1,
      termsHash: hash("th"),
    };
    const r1 = {
      taskId: "t1",
      agentId: "a1",
      outputHash: hash("o"),
      output: { ok: true },
      submittedAt: 1,
      verifierKind: "hash" as const,
      verifierNote: "",
    };
    const v1 = {
      taskId: "t1",
      verifierId: "v",
      verdict: "pass" as const,
      reason: "ok",
      evidenceHash: hash("e"),
      verifiedAt: 1,
    };
    const aRoot = computeAssignmentRoot([a]);
    const rRoot = computeResultRoot([r1], [v1]);
    expect(aRoot).to.match(/^0x[0-9a-f]{64}$/);
    expect(rRoot).to.match(/^0x[0-9a-f]{64}$/);
  });

  it("derives the account address from the private key", () => {
    // 0x11...11 is not a real secp256k1 scalar, so the derived
    // account address will be deterministic but arbitrary; we just
    // assert the constructor succeeded and `account` is a valid
    // 20-byte hex string.
    const c = new PharosAtlanticClient({
      rpcUrl: "https://atlantic-rpc.pharosnetwork.xyz",
      chainId: ATLANTIC_CHAIN_ID,
      registryAddress: "0x" + "44".repeat(20),
      deployerPrivateKey: "0x" + "11".repeat(32),
    });
    expect(c.account).to.match(/^0x[0-9a-fA-F]{40}$/);
    expect(c.registryAddress).to.equal("0x" + "44".repeat(20));
  });

  it("hashes the jobId to a stable 32-byte value", () => {
    const a = PharosAtlanticClient.jobIdToBytes32("demo");
    const b = PharosAtlanticClient.jobIdToBytes32("demo");
    expect(a).to.equal(b);
    expect(a).to.match(/^0x[0-9a-f]{64}$/);
    expect(PharosAtlanticClient.jobIdToBytes32("other")).to.not.equal(a);
  });
});
