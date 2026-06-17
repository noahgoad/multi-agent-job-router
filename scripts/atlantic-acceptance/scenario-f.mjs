// Scenario F: Final receipt verification (on-chain roundtrip).
//
// Thin wrapper around `on-chain-roundtrip.mjs`. The actual on-chain
// interaction lives in that file; this script re-exports its exit
// status so the shell wrapper can run either implementation.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readEnvFile(path) {
  const env = {};
  if (!existsSync(path)) return env;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const repoRoot = resolve(__dirname, "..", "..");
const contractArg =
  process.argv[2] ??
  readEnvFile(resolve(repoRoot, ".env")).PHAROS_REGISTRY_ADDRESS;

if (!contractArg) {
  console.error(
    "Scenario F: missing contract address. Pass it as argv[2] or set PHAROS_REGISTRY_ADDRESS in .env."
  );
  process.exit(1);
}

const child = spawnSync(
  process.execPath,
  [resolve(__dirname, "on-chain-roundtrip.mjs"), contractArg],
  { stdio: "inherit", cwd: repoRoot }
);
process.exit(child.status ?? 1);
