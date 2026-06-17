import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

/**
 * Local acceptance orchestrator.
 *
 * Runs the full set of local checks in order:
 *   1. isolation check
 *   2. secret scan
 *   3. typecheck
 *   4. unit + integration tests
 *   5. build
 *   6. Hardhat contract tests
 *
 * Each step is skipped gracefully if the required toolchain is
 * missing, with a clear "skipped" message; missing toolchain does
 * not cause the script to exit with a non-zero code so the final
 * report can be authored even on a sandboxed workstation.
 *
 * On Windows, Node's `os.tmpdir()` may return an extended-length
 * path with the `\\?\` prefix. Some toolchains (notably `vitest`'s
 * SSR cache and a few Vitest/Vite plugin internals) mis-handle the
 * prefix and try to create directories at the literal `D:\?\...`
 * path. To avoid that, we resolve a plain `C:\...\Temp` (or
 * `/tmp`) directory for the spawned processes when the default
 * `os.tmpdir()` is a long-path one.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

function plainTempDir() {
  const t = tmpdir();
  // Strip the Windows `\\?\` extended-length path prefix and any
  // UNC `\\` prefix so child processes get a portable path.
  if (/^\\\\\?\\/.test(t)) {
    return t.slice(4);
  }
  if (/^\\\\/.test(t)) {
    return t.slice(2);
  }
  return t;
}

const tempDir = plainTempDir();
if (!existsSync(tempDir)) {
  try {
    mkdirSync(tempDir, { recursive: true });
  } catch {
    /* ignore - the call below will surface a clearer error */
  }
}

const childEnv = {
  ...process.env,
  TEMP: tempDir,
  TMPDIR: tempDir,
  TMP: tempDir,
};

const steps = [
  { name: "isolation", cmd: ["node", "tools/check-isolation.mjs"] },
  { name: "secrets", cmd: ["node", "tools/check-secrets.mjs"] },
  {
    name: "typecheck",
    cmd: ["node", "node_modules/typescript/bin/tsc", "-b", "--pretty"],
  },
  {
    name: "test",
    cmd: ["node", "node_modules/vitest/vitest.mjs", "run"],
  },
  {
    name: "build",
    cmd: ["node", "node_modules/typescript/bin/tsc", "-b"],
  },
  {
    name: "contracts",
    cmd: [
      "node",
      "node_modules/hardhat/internal/cli/bootstrap.js",
      "--config",
      "packages/contracts/hardhat.config.cjs",
      "test",
      "packages/contracts/test/atlantic.test.ts",
      "packages/contracts/test/registry.test.ts",
      "packages/contracts/test/invariants.test.ts",
    ],
  },
];

let passed = 0;
let skipped = 0;
let failed = 0;
const summary = [];

for (const step of steps) {
  if (
    step.cmd[0] === "npx" &&
    !existsSync(resolve(projectRoot, "node_modules"))
  ) {
    console.log(`skipped:${step.name} (no node_modules; toolchain missing)`);
    summary.push(`${step.name}: SKIPPED (toolchain missing)`);
    skipped++;
    continue;
  }
  const r = spawnSync(step.cmd[0], step.cmd.slice(1), {
    cwd: projectRoot,
    stdio: "inherit",
    env: childEnv,
  });
  if (r.status === 0) {
    console.log(`ok:${step.name}`);
    summary.push(`${step.name}: OK`);
    passed++;
  } else if (r.error && /ENOENT/.test(r.error.message)) {
    console.log(`skipped:${step.name} (tool not found)`);
    summary.push(`${step.name}: SKIPPED (tool not found)`);
    skipped++;
  } else {
    console.log(`failed:${step.name}`);
    summary.push(`${step.name}: FAILED`);
    failed++;
  }
}

console.log("---");
console.log("summary:");
for (const line of summary) console.log(line);
console.log(`totals: passed=${passed} skipped=${skipped} failed=${failed}`);

if (failed > 0) process.exit(1);
