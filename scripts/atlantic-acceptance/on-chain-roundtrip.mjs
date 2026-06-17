// End-to-end on-chain interaction test for the deployed
// JobRouterRegistry contract. Calls `recordAssignment` and
// `finalizeReceipt` against the live Atlantic deployment, then
// reads the on-chain `getReceipt` and compares it with the
// locally computed roots.
//
// Usage:
//   node scripts/atlantic-acceptance/on-chain-roundtrip.mjs <contractAddress>

import { createPublicClient, createWalletClient, http, keccak256, stringToBytes, toBytes, encodeFunctionData } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { readFileSync } from "node:fs";

const env = {};
for (const raw of readFileSync(".env", "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  env[m[1]] = v;
}

const contractAddress = process.argv[2] || env.PHAROS_REGISTRY_ADDRESS;
if (!contractAddress) {
  console.error("usage: node scripts/atlantic-acceptance/on-chain-roundtrip.mjs <contractAddress>");
  process.exit(1);
}

const account = privateKeyToAccount(env.ROUTER_DEPLOYER_PRIVATE_KEY);
const transport = http(env.PHAROS_RPC_URL);
const publicClient = createPublicClient({ transport });
const walletClient = createWalletClient({ account, transport });

const REGISTRY_ABI = [
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
];

function hash32(label) {
  return keccak256(toBytes(label));
}

const jobId = hash32("atlantic-acceptance-scenario-f-" + new Date().toISOString());
const dagHash = hash32("dag-hash-for-job-" + jobId);
const assignmentRoot = hash32("assignment-root-for-job-" + jobId);
const resultRoot = hash32("result-root-for-job-" + jobId);
const verificationRoot = hash32("verification-root-for-job-" + jobId);
const totalSpent = 12345n;

console.log("=== On-chain roundtrip ===");
console.log("chainId       :", await publicClient.getChainId());
console.log("contract      :", contractAddress);
console.log("caller        :", account.address);
console.log("jobId         :", jobId);
console.log();

const tx1Hash = await walletClient.writeContract({
  address: contractAddress,
  abi: REGISTRY_ABI,
  functionName: "recordAssignment",
  args: [jobId, dagHash, assignmentRoot],
});
console.log("recordAssignment tx :", tx1Hash);
const r1 = await publicClient.waitForTransactionReceipt({ hash: tx1Hash });
console.log("  block          :", r1.blockNumber.toString());
console.log("  gas used       :", r1.gasUsed.toString());
console.log("  status         :", r1.status);

const tx2Hash = await walletClient.writeContract({
  address: contractAddress,
  abi: REGISTRY_ABI,
  functionName: "finalizeReceipt",
  args: [jobId, resultRoot, verificationRoot, totalSpent],
});
console.log("finalizeReceipt tx  :", tx2Hash);
const r2 = await publicClient.waitForTransactionReceipt({ hash: tx2Hash });
console.log("  block          :", r2.blockNumber.toString());
console.log("  gas used       :", r2.gasUsed.toString());
console.log("  status         :", r2.status);
console.log();

const onChain = await publicClient.readContract({
  address: contractAddress,
  abi: REGISTRY_ABI,
  functionName: "getReceipt",
  args: [jobId],
});

console.log("=== On-chain getReceipt ===");
console.log("dagHash          :", onChain[0], onChain[0] === dagHash ? "OK" : "MISMATCH");
console.log("assignmentRoot   :", onChain[1], onChain[1] === assignmentRoot ? "OK" : "MISMATCH");
console.log("resultRoot       :", onChain[2], onChain[2] === resultRoot ? "OK" : "MISMATCH");
console.log("verificationRoot :", onChain[3], onChain[3] === verificationRoot ? "OK" : "MISMATCH");
console.log("isFinalized      :", onChain[4], onChain[4] === true ? "OK" : "MISMATCH");

const allOk =
  onChain[0] === dagHash &&
  onChain[1] === assignmentRoot &&
  onChain[2] === resultRoot &&
  onChain[3] === verificationRoot &&
  onChain[4] === true;

if (!allOk) {
  console.error("Roundtrip FAILED");
  process.exit(1);
}
console.log();
console.log("Roundtrip OK.");
