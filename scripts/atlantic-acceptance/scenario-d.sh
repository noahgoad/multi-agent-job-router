#!/usr/bin/env bash
# Scenario D: Budget rejection
#
# Runs `scenario-d.mjs` which exercises the workflow compiler's
# `budget_overflow` validation. A spec whose per-task budgets sum
# to more than the job budget is rejected at compile time; the
# orchestrator catches the failure and marks every task as
# `FAILED` with `totalSpent == 0`.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/atlantic-acceptance/scenario-d.mjs
