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

  it("publishes a stubbed assignment and receipt", async () => {
    const c = new PharosAtlanticClient({
      rpcUrl: "https://atlantic-rpc.pharosnetwork.xyz",
      chainId: ATLANTIC_CHAIN_ID,
      registryAddress: "0x" + "44".repeat(20),
      deployerPrivateKey: "0x" + "11".repeat(32),
    });
    const a = {
      taskId: "t1",
      agentId: "a1",
      skillReleaseHash: hash("sr"),
      score: 80,
      assignedAt: 1,
      termsHash: hash("th"),
    };
    const pub = await c.publishAssignment({} as never, hash("dag"), [a]);
    expect(pub.txHash).to.match(/^0x[0-9a-f]{64}$/);
    const verify = await c.verifyOnChain("job-1", {
      dagHash: hash("dag"),
      resultRoot: hash("r"),
      verificationRoot: hash("v"),
    });
    expect(verify.matches).to.equal(true);
  });
});
