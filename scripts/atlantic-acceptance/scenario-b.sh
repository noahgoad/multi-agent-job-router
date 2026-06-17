#!/usr/bin/env bash
# Scenario B: Failed worker reassignment
#
# Runs `scenario-b.mjs` which exercises the bounded-retry path (the
# first two worker attempts fail, the third succeeds) and the
# persistent-failure path (the worker always throws and the task
# ends in `FAILED`).
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/atlantic-acceptance/scenario-b.mjs
