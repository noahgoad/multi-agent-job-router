# Environment Status

This document records the state of the development environment for
the Pharos Multi-Agent Job Router at the time of authoring.

## Sandbox Probes

| Tool    | Status      | Path                          |
|---------|-------------|-------------------------------|
| `git`   | Missing     | -                             |
| `node`  | **Available** | `C:\Program Files\nodejs\node.exe` (v24.14.1) |
| `npm`   | **Available** | `C:\Program Files\nodejs\npm.cmd` (11.11.0) |
| `pnpm`  | Missing     | -                             |
| `yarn`  | Missing     | -                             |
| `psql`  | Missing     | -                             |
| `tsc`   | Available via `node node_modules/typescript/bin/tsc` | - |
| `forge` | Missing     | -                             |
| `hardhat` | Available via `node node_modules/hardhat/internal/cli/bootstrap.js` | - |

The Node.js and npm tools are available on this workstation (the
sandbox is `D:\pharos-future-ideas\04-multi-agent-job-router`).
Git is still not installed. `tsc`, `hardhat`, and `vitest` are
invoked through the `node` binary that ships in the project's
`node_modules`; `npx` is blocked by the PowerShell sandbox
posture (see `docs/HANDOFF.md` §13).

## Impact

- Source code, configuration, schemas, and documentation can be
  authored in this sandbox because they are plain text files.
- `npx.ps1` is blocked by PowerShell, but every command can be
  executed by calling `node` with the resolved tool path under
  `node_modules`. `tools/verify.mjs` is the canonical command
  to run the local-acceptance gate; it spawns each step with
  `node` directly and reports 7/7 OK.
- `npm install` works; the workspace symlinks are created under
  `node_modules/@pharos-router/`.
- Atlassian CLI toolchain (`forge`, `psql`) and on-chain
  credentials are still missing; the deploy and acceptance
  scenarios remain dry-run-only.
- Git commits cannot be authored here; a manual change log is
  maintained at `docs\change-log.md`.

## Required Workstation Toolchain

The user should run the final local verification on a workstation
with the following installed:

- Node.js 20.x
- npm 10.x (or pnpm 8.x)
- Git 2.40+
- PostgreSQL 15+
- Foundry (forge, anvil) - optional, for invariant fuzzing

The provided `package.json` declares `npm` scripts for every required
command. The `tools\verify.ps1` PowerShell script automates the
local-acceptance gate.

## How to Run Final Verification

From the project root on a properly tooled workstation:

```powershell
# Install dependencies
npm ci

# Typecheck
npm run typecheck

# Lint
npm run lint

# Run all tests
npm test

# Build
npm run build

# Run the protected-file hash check
npm run check:protected

# Run isolation check
npm run check:isolation

# Run secret scan
npm run check:secrets

# Or run everything at once
.\tools\verify.ps1
```