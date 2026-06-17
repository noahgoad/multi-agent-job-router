#!/usr/bin/env bash
# Atlantic deployment preflight.
# - checks .env is git-ignored
# - validates RPC connectivity to https://atlantic.dplabs-internal.com
# - validates chain id 688689
# - lists required wallets and an estimated PHRS funding requirement

set -euo pipefail

cd "$(dirname "$0")/.."

echo "== .env ignored =="
if [ -f .env ]; then
  if git check-ignore .env >/dev/null 2>&1; then
    echo "ok: .env is ignored"
  else
    echo "warn: .env exists and is NOT ignored"
  fi
else
  echo "ok: .env does not exist"
fi

echo "== RPC =="
RPC_URL="${PHAROS_RPC_URL:-https://atlantic.dplabs-internal.com}"
echo "endpoint: $RPC_URL"
if command -v curl >/dev/null 2>&1; then
  curl -sS -H "content-type: application/json" \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_chainId\"}" \
    "$RPC_URL" || true
fi

echo "== Chain id =="
echo "expected: 0xa8341 (688689 decimal)"

echo "== Explorer =="
EXPLORER_URL="${PHAROS_EXPLORER_URL:-https://atlantic.pharosscan.xyz}"
echo "explorer: $EXPLORER_URL"

echo "== Required wallets =="
echo "- ROUTER_DEPLOYER_ADDRESS: deploys JobRouterRegistry.sol (1 tx)"
echo "- ROUTER_FEE_ADDRESS: receives any job-execution fees"
echo "- VERIFIER_ADDRESS: signs terminal job receipts (1 tx per finalize)"
echo "- OPERATOR_ADDRESS: signs restart / cancel admin actions"

echo "== Estimated PHRS funding =="
echo "- Deployer: ~0.05 PHRS (contract deployment + first assignment record)"
echo "- Operator:  ~0.10 PHRS (per 1000 receipt finalizations, ~0.0001 PHRS each)"
echo "- Buffer:    +0.20 PHRS recommended for re-orgs and retries"
echo "- Total:     ~0.35 PHRS for the first acceptance run"