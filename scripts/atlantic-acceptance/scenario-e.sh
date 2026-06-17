#!/usr/bin/env bash
# Scenario E: Risky-target rejection
#
# Runs `scenario-e.mjs` which exercises the `StaticGoplusClient`
# with a denylist and asserts that a denylisted address returns
# `verdict: "risky"`. The scenario also runs an end-to-end job in
# which the worker for t2 consults GoPlus before submitting and
# aborts with `goplus_risky_target` when the target is denylisted.
set -euo pipefail
cd "$(dirname "$0")/../.."
exec node scripts/atlantic-acceptance/scenario-e.mjs
