#!/usr/bin/env bash
# Alibaba Cloud Function Compute deployment scaffold.
# This is a preflight script. It does not actually call aliyun CLI;
# it emits the configuration the operator needs to apply.

set -euo pipefail

REGION="${ALIYUN_REGION:-cn-hangzhou}"
SERVICE_NAME="${ALIYUN_FC_SERVICE_NAME:-pharos-router-orchestrator}"

cat <<JSON
{
  "service": "${SERVICE_NAME}",
  "region": "${REGION}",
  "functions": [
    {
      "name": "orchestrator",
      "runtime": "nodejs20",
      "handler": "index.handler",
      "memoryMB": 512,
      "timeoutSeconds": 60,
      "env": {
        "PHAROS_RPC_URL": "${PHAROS_RPC_URL:-https://atlantic.dplabs-internal.com}",
        "PHAROS_CHAIN_ID": "688689",
        "PHAROS_EXPLORER_URL": "${PHAROS_EXPLORER_URL:-https://atlantic.pharosscan.xyz}",
        "PHAROS_REGISTRY_ADDRESS": "${PHAROS_REGISTRY_ADDRESS:-}",
        "DATABASE_URL": "${DATABASE_URL:-postgres://router:router@localhost:5432/pharos_router}"
      }
    },
    {
      "name": "verifier",
      "runtime": "nodejs20",
      "handler": "index.handler",
      "memoryMB": 256,
      "timeoutSeconds": 30
    },
    {
      "name": "api",
      "runtime": "nodejs20",
      "handler": "index.handler",
      "memoryMB": 512,
      "timeoutSeconds": 30
    }
  ],
  "vpc": {
    "vpcId": "",
    "vSwitchIds": [],
    "securityGroupId": ""
  }
}
JSON