#!/usr/bin/env bash
# Scenario F: Final receipt verification
#
# Runs `scenario-f.mjs`, which in turn spawns the live on-chain
# `on-chain-roundtrip.mjs` against the deployed
# `JobRouterRegistry` contract on Pharos Atlantic. The script
# calls `recordAssignment` + `finalizeReceipt` and reads back
# `getReceipt(jobId)` to confirm every field matches the local
# computation. The contract address can be passed as $1 or read
# from `.env` (`PHAROS_REGISTRY_ADDRESS`).
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/atlantic-acceptance/scenario-f.mjs "${1:-}"
