// Verify the on-chain JobRouterRegistry contract.
import { createPublicClient, http, getAddress } from "viem";
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

const contractAddress = process.argv[2];
if (!contractAddress) {
  console.error("usage: node tools/verify-deploy.mjs <contractAddress>");
  process.exit(1);
}

const client = createPublicClient({ transport: http(env.PHAROS_RPC_URL) });

const code = await client.getBytecode({ address: contractAddress });
const owner = await client.readContract({
  address: contractAddress,
  abi: [
    {
      type: "function",
      name: "owner",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "address" }],
    },
  ],
  functionName: "owner",
});
const chainId = await client.getChainId();
const block = await client.getBlockNumber();

const codeSize = code ? (code.length - 2) / 2 : 0;
const ok = owner.toLowerCase() === env.ROUTER_DEPLOYER_ADDRESS.toLowerCase();

console.log("chainId          :", chainId, chainId === Number(env.PHAROS_CHAIN_ID) ? "OK" : "MISMATCH");
console.log("block            :", block.toString());
console.log("contract         :", contractAddress);
console.log("code size (bytes):", codeSize, codeSize > 0 ? "OK (code present)" : "EMPTY (no contract!)");
console.log("owner            :", owner);
console.log("matches deployer :", ok ? "YES" : "NO");

if (!ok || codeSize === 0) {
  process.exit(1);
}
