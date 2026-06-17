// Show deployer balance, nonce, and latest block.
import { createPublicClient, http, formatEther } from "viem";
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

const client = createPublicClient({ transport: http(env.PHAROS_RPC_URL) });
const bal = await client.getBalance({ address: env.ROUTER_DEPLOYER_ADDRESS });
const nonce = await client.getTransactionCount({ address: env.ROUTER_DEPLOYER_ADDRESS });
const block = await client.getBlockNumber();

console.log("current block   :", block.toString());
console.log("deployer        :", env.ROUTER_DEPLOYER_ADDRESS);
console.log("nonce           :", nonce.toString());
console.log("balance (wei)   :", bal.toString());
console.log("balance (PHRS)  :", formatEther(bal));
