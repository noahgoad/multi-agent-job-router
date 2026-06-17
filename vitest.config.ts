import { defineConfig } from "vitest/config";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Vitest config for the Pharos Multi-Agent Job Router monorepo.
 *
 * The cross-workspace dependencies are aliased at the top level to
 * their source directories. This avoids depending on the npm
 * workspace symlink resolution behavior (which differs between
 * Windows junctions and Unix symlinks).
 *
 * The `packages/contracts` workspace is excluded from the unit test
 * run because it uses Hardhat's mocha-based test runner. Contract
 * tests are invoked by `npm run test:contracts` from the
 * `packages/contracts` directory. The alias is still defined because
 * the API workspace imports the contracts package's viem helpers
 * (e.g. `computeAssignmentRoot`, `computeResultRoot`).
 */

const __filename = fileURLToPath(import.meta.url);
const repoRoot = dirname(__filename);

const alias = {
  "@pharos-router/policy": resolve(repoRoot, "packages/policy/src/index.ts"),
  "@pharos-router/workflow": resolve(
    repoRoot,
    "packages/workflow/src/index.ts"
  ),
  "@pharos-router/registry": resolve(
    repoRoot,
    "packages/registry/src/index.ts"
  ),
  "@pharos-router/routing": resolve(repoRoot, "packages/routing/src/index.ts"),
  "@pharos-router/sdk": resolve(repoRoot, "packages/sdk/src/index.ts"),
  "@pharos-router/orchestrator": resolve(
    repoRoot,
    "services/orchestrator/src/index.ts"
  ),
  "@pharos-router/verifier": resolve(
    repoRoot,
    "services/verifier/src/index.ts"
  ),
  "@pharos-router/contracts": resolve(
    repoRoot,
    "packages/contracts/src/index.ts"
  ),
};

export default defineConfig({
  resolve: { alias },
  test: {
    environment: "node",
    include: [
      "packages/*/test/**/*.test.ts",
      "packages/*/test/**/*.test.tsx",
      "services/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.ts",
      "apps/*/test/**/*.test.tsx",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/e2e/**",
      "packages/contracts/**",
    ],
  },
});
