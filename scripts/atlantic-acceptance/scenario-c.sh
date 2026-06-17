#!/usr/bin/env bash
# Scenario C: Verifier disagreement
#
# Runs `scenario-c.mjs` which makes the verifier return `ok = false`
# for t3. The orchestrator must record t3 as `FAILED` while t1 and
# t2 still end in `VERIFIED`. The disagreement is recorded per-task
# rather than aborting the whole job.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/atlantic-acceptance/scenario-c.mjs
