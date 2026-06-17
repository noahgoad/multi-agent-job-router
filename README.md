# Pharos Multi-Agent Job Router

Coordination layer that decomposes approved jobs into bounded tasks, selects qualified agents, verifies intermediate results, and produces verifiable final receipts.

## Core Scope

- Compile approved structured jobs into acyclic task graphs.
- Select agents using capability, trust, cost, latency, and availability.
- Issue least-privilege task permissions and enforce budgets.
- Recover from timeouts, failed workers, and verifier disagreements.
- Aggregate only verified results and anchor job receipts on Pharos.

## Partner Integrations

- **Alibaba Cloud:** resilient orchestration and optional Qwen task-decomposition proposals.
- **GoPlus:** transaction-target checks for routed financial tasks.
- **CertiK:** restrict routing to approved skill releases.
- **Pharos:** assignment and terminal job receipt anchoring.

## Status

Planning only. No application or contracts have been implemented.

## Implementation Plan

[Multi-Agent Job Router Master Plan](docs/superpowers/plans/2026-06-13-multi-agent-job-router-master-plan.md)
