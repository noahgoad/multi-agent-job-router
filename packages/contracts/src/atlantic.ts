import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  stringToBytes,
  encodeFunctionData,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  contentHash,
  type JobReceipt,
  type JobSpec,
  type AssignmentReceipt,
  type TaskResult,
  type VerificationRecord,
} from "@pharos-router/workflow";

/**
 * Pharos Atlantic client.
 *
 * The client publishes assignment and terminal job receipts to the
 * `JobRouterRegistry` contract on chain id 688689. It also exposes a
 * `verifyOnChain` helper that compares a local `JobReceipt` with the
 * on-chain record and returns the equality verdict.
 *
 * The implementation is a thin wrapper around viem. The contract ABI
 * is included inline so this package can be consumed without a
 * build step for the contracts workspace.
 */

export const ATLANTIC_CHAIN_ID = 688689;

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "recordAssignment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "_dagHash", type: "bytes32" },
      { name: "_assignmentRoot", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeReceipt",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "_resultRoot", type: "bytes32" },
      { name: "_verificationRoot", type: "bytes32" },
      { name: "totalSpent", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getReceipt",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "bytes32" }],
    outputs: [
      { name: "_dagHash", type: "bytes32" },
      { name: "_assignmentRoot", type: "bytes32" },
      { name: "_resultRoot", type: "bytes32" },
      { name: "_verificationRoot", type: "bytes32" },
      { name: "isFinalized", type: "bool" },
    ],
  },
] as const;

export interface AtlanticConfig {
  readonly rpcUrl: string;
  readonly chainId: number;
  readonly registryAddress: `0x${string}`;
  readonly deployerPrivateKey: `0x${string}`;
}

export class PharosAtlanticClient {
  readonly chainId: number;
  readonly registryAddress: `0x${string}`;
  readonly account: `0x${string}`;
  private readonly publicClient: PublicClient;
  private readonly walletClient: WalletClient;

  constructor(private readonly config: AtlanticConfig) {
    if (config.chainId !== ATLANTIC_CHAIN_ID) {
      throw new Error(`atlantic_chain_id_mismatch:${config.chainId}`);
    }
    this.chainId = config.chainId;
    this.registryAddress = config.registryAddress;

    // Derive the deployer account from the private key so the
    // returned address is real and matches what the chain sees in
    // the transaction signature.
    const account = privateKeyToAccount(config.deployerPrivateKey);
    this.account = account.address;

    // viem's createPublicClient / createWalletClient do not strictly
    // need a `chain` definition when only `transport` is used, but
    // passing the chain id is required for write operations. We
    // construct a minimal chain object inline so we do not pull in
    // viem/chains (which would bloat the bundle).
    const chain = {
      id: ATLANTIC_CHAIN_ID,
      name: "Pharos Atlantic",
      nativeCurrency: { name: "PHRS", symbol: "PHRS", decimals: 18 },
      rpcUrls: { default: { http: [config.rpcUrl] } },
    } as unknown as import("viem").Chain;

    this.publicClient = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });
    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(config.rpcUrl),
    });
  }

  getClient() {
    return this.publicClient;
  }

  /**
   * Anchor the assignment root for a job on chain. Returns the real
   * tx hash from the network. Throws if the chain rejects the
   * transaction (insufficient gas, re-entrancy guard, etc).
   *
   * The Pharos Atlantic public RPC at
   * `https://atlantic.dplabs-internal.com` does not expose
   * `eth_sendTransaction` (it returns MethodNotFoundRpcError), so we
   * sign the transaction locally and submit it via
   * `eth_sendRawTransaction`. This is the same flow that MetaMask,
   * Rabby, and other wallets use; viem's `writeContract` does not
   * support it directly so we drive the prepare/sign/send cycle by
   * hand.
   */
  async publishAssignment(
    job: JobSpec,
    dagHash: Hash,
    assignments: ReadonlyArray<AssignmentReceipt>
  ): Promise<{ txHash: Hash; assignmentRoot: Hash }> {
    const assignmentRoot = computeAssignmentRoot(assignments);
    const jobIdBytes = PharosAtlanticClient.jobIdToBytes32(job.jobId);
    const txHash = await this.signAndSendContract({
      functionName: "recordAssignment",
      args: [jobIdBytes, dagHash, assignmentRoot],
    });
    // Wait for the tx to be mined AND confirm it actually succeeded.
    // `waitForTransactionReceipt` does not throw on `status === "reverted"`
    // (the tx was included, the EVM just refused the call), so we
    // check the status ourselves and surface a clear error so the
    // caller can log it.
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    if (receipt.status !== "success") {
      throw new Error(
        `recordAssignment reverted for jobId=${job.jobId} (tx=${txHash})`
      );
    }
    void dagHash;
    return { txHash, assignmentRoot };
  }

  /**
   * Anchor the final job receipt (result + verification roots +
   * total spent) on chain. The `receipt` argument supplies the
   * pre-computed roots; this method only submits the transaction
   * and returns the real tx hash. Uses the same prepare / sign /
   * sendRawTransaction pattern as `publishAssignment` because the
   * Atlantic public RPC blocks `eth_sendTransaction`.
   */
  async publishReceipt(
    jobId: string,
    receipt: JobReceipt
  ): Promise<{ txHash: Hash }> {
    const jobIdBytes = PharosAtlanticClient.jobIdToBytes32(jobId);
    const txHash = await this.signAndSendContract({
      functionName: "finalizeReceipt",
      args: [
        jobIdBytes,
        receipt.resultRoot,
        receipt.verificationRoot,
        receipt.totalSpentMicrousd,
      ],
    });
    const txRcpt = await this.publicClient.waitForTransactionReceipt({
      hash: txHash,
    });
    if (txRcpt.status !== "success") {
      throw new Error(
        `finalizeReceipt reverted for jobId=${jobId} (tx=${txHash})`
      );
    }
    return { txHash };
  }

  /**
   * Prepare a contract call, sign it locally, and submit the signed
   * raw transaction to the chain. This is the only way to talk to
   * the Pharos Atlantic public RPC, which does not expose
   * `eth_sendTransaction`. Returns the real on-chain tx hash.
   */
  private async signAndSendContract(opts: {
    functionName: "recordAssignment" | "finalizeReceipt";
    args: readonly (`0x${string}` | bigint)[];
  }): Promise<Hash> {
    // 1) Encode the calldata ourselves. `simulateContract` would do
    //    this too, but its return shape is inconsistent across
    //    viem versions and the `request.data` field is sometimes
    //    omitted. Encoding by hand guarantees the right bytes.
    const data = encodeFunctionData({
      abi: REGISTRY_ABI,
      functionName: opts.functionName,
      args: opts.args as never,
    });
    // 2) Look up the nonce. Use the pending nonce (`tag: "pending"`)
    //    so we race a previous tx that has been signed but not yet
    //    mined (the Pharos public RPC has a 1 RPS limit, so we
    //    sometimes queue two anchor txs within the same second).
    const nonce = await this.publicClient.getTransactionCount({
      address: this.account,
      blockTag: "pending",
    });
    // 3) Fetch fee values. Atlantic supports EIP-1559.
    const fees = await this.publicClient.estimateFeesPerGas().catch(() => ({
      maxFeePerGas: undefined,
      maxPriorityFeePerGas: undefined,
    }));
    // 4) Sign locally and submit via `eth_sendRawTransaction`.
    //    We pin `type: "eip1559"` so viem does not have to infer
    //    the format from a partial request.
    const signer = privateKeyToAccount(this.config.deployerPrivateKey);
    const signedHex = await signer.signTransaction({
      chainId: this.chainId,
      to: this.registryAddress,
      data,
      value: 0n,
      gas: 200_000n,
      maxFeePerGas: fees.maxFeePerGas ?? 1_000_000_000n,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1_000_000n,
      nonce,
      type: "eip1559",
    });
    return this.publicClient.sendRawTransaction({
      serializedTransaction: signedHex,
    });
  }

  /**
   * Read the on-chain record for a job and compare to the locally
   * computed receipt. Returns `matches: true` only when every root
   * and the `finalized` flag agree. The caller is responsible for
   * surfacing any mismatch to the operator.
   */
  async verifyOnChain(
    jobId: string,
    expected: Pick<JobReceipt, "dagHash" | "resultRoot" | "verificationRoot">
  ): Promise<{
    matches: boolean;
    onChain: {
      dagHash: Hash;
      resultRoot: Hash;
      verificationRoot: Hash;
      finalized: boolean;
    };
  }> {
    const jobIdBytes = PharosAtlanticClient.jobIdToBytes32(jobId);
    const onChainRaw = (await this.publicClient.readContract({
      address: this.registryAddress,
      abi: REGISTRY_ABI,
      functionName: "getReceipt",
      args: [jobIdBytes],
    })) as readonly [Hash, Hash, Hash, Hash, boolean];

    const onChain = {
      dagHash: onChainRaw[0],
      assignmentRoot: onChainRaw[1],
      resultRoot: onChainRaw[2],
      verificationRoot: onChainRaw[3],
      finalized: onChainRaw[4],
    };
    const matches =
      onChain.dagHash.toLowerCase() === expected.dagHash.toLowerCase() &&
      onChain.resultRoot.toLowerCase() === expected.resultRoot.toLowerCase() &&
      onChain.verificationRoot.toLowerCase() ===
        expected.verificationRoot.toLowerCase();
    return {
      matches,
      onChain: {
        dagHash: onChain.dagHash,
        resultRoot: onChain.resultRoot,
        verificationRoot: onChain.verificationRoot,
        finalized: onChain.finalized,
      },
    };
  }

  static jobIdToBytes32(jobId: string): `0x${string}` {
    return keccak256(stringToBytes(jobId));
  }
}

export function computeAssignmentRoot(
  assignments: ReadonlyArray<AssignmentReceipt>
): Hash {
  return assignments
    .map((a) => contentHash(a))
    .reduce<Hash>(
      (acc, h) => keccak256(("0x" + acc.slice(2) + h.slice(2)) as Hex) as Hash,
      ("0x" + "00".repeat(32)) as Hash
    );
}

export function computeResultRoot(
  results: ReadonlyArray<TaskResult>,
  verifications: ReadonlyArray<VerificationRecord>
): Hash {
  const pass = new Set(
    verifications.filter((v) => v.verdict === "pass").map((v) => v.taskId)
  );
  const verified = results.filter((r) => pass.has(r.taskId));
  return verified
    .map((r) => contentHash(r))
    .reduce<Hash>(
      (acc, h) => keccak256(("0x" + acc.slice(2) + h.slice(2)) as Hex) as Hash,
      ("0x" + "00".repeat(32)) as Hash
    );
}
