#!/usr/bin/env bash
# Scenario A: Successful multi-agent job
#
# Runs `scenario-a.mjs` which executes a 3-task job through the
# `Orchestrator` with a registered, trusted agent and asserts that
# every task ends in `VERIFIED` with the expected total spend.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/atlantic-acceptance/scenario-a.mjs
