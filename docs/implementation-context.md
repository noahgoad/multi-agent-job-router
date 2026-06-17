# Implementation Context

This document captures the design and engineering context that informs
the implementation of the Pharos Multi-Agent Job Router. It is a
non-protected operational document and may be updated as the project
evolves.

## Project Identity

- **Name:** Pharos Multi-Agent Job Router
- **Namespace:** `@pharos-router/*`
- **Workspace root:**
  `C:\Users\Mai Xuan Canh\Downloads\pharos-future-ideas\04-multi-agent-job-router`
- **Linked Pharos ideas (read-only):** none within the project; the
  project integrates with the partner systems listed below.

## Architecture Summary

The router is a coordination layer that decomposes an approved,
structured job into an acyclic task graph, selects qualified agents for
each task, verifies intermediate and final results, and produces a
verifiable Pharos-anchored job receipt.

The system is composed of:

- **Workflow compiler** (`packages\workflow`) - converts an approved
  `JobSpec` into a deterministic DAG and rejects cycles, unreachable
  tasks, excessive permissions, invalid budgets, and unsafe deadlines.
- **Agent and skill registry** (`packages\registry`) - tracks agents,
  their capabilities, skill release hashes, CertiK verdicts, signed
  heartbeats, and pricing.
- **Routing engine** (`packages\routing`) - scores agents against task
  requirements using capability fit, trust, cost, latency, availability,
  and prior success; enforces diversity and anti-collusion constraints.
- **Orchestrator** (`services\orchestrator`) - executes only ready
  tasks, issues least-privilege task tokens, enforces timeouts,
  bounded retries, cancellation, and restart recovery.
- **Verifier** (`services\verifier`) - supports schema, hash,
  deterministic-computation, transaction, and human verification.
- **Policy package** (`packages\policy`) - permission propagation,
  budget accounting, approval gates, and human-in-the-loop rules.
- **Contracts package** (`packages\contracts`) - Solidity sources for
  the on-chain assignment and terminal job receipt registry.
- **SDK** (`packages\sdk`) - typed TypeScript client used by the API
  and dashboard.
- **API** (`apps\api`) - Fastify HTTP service exposing
  create/approve/route/execute/verify/cancel/retry/inspect operations.
- **Web dashboard** (`apps\web`) - React + Vite UI for DAG
  visualization, candidate inspection, evidence, and receipts.
- **MCP server** (`apps\mcp`) - Model Context Protocol tool surface
  for AI assistants.

## Trust Integrations

- **Alibaba Cloud** - hosts the orchestrator, verifier, and API as
  isolated services and exposes Qwen (via Model Studio) for optional
  task-decomposition proposals. Qwen may only propose; it cannot
  authorize execution.
- **GoPlus** - performs transaction-target checks before any task
  that proposes a risky token, address, or approval interaction.
- **CertiK** - scan verdicts are attached to skill releases; failed
  or expired releases are rejected.
- **Pharos** - assignment and terminal job receipt hashes are
  anchored on-chain via a dedicated registry contract.

## Tech Stack

- **Language:** TypeScript (Node.js 20.x target) for API, services,
  SDK, and orchestrator.
- **API framework:** Fastify.
- **Database:** PostgreSQL with Drizzle-style migrations.
- **Workflow engine:** a deterministic in-house DAG runner
  (`packages\workflow`).
- **Blockchain tooling:** viem for client-side interactions and
  Hardhat for contract tests.
- **Frontend:** React + Vite.
- **MCP:** the official Model Context Protocol TypeScript SDK.
- **Testing:** Vitest for unit/integration tests, Hardhat for
  contract tests, Playwright for browser tests.

## Phased Delivery

The implementation follows the ten-task plan in
`docs\superpowers\plans\2026-06-13-multi-agent-job-router-master-plan.md`:
initialization, schemas, compiler, registry, routing, orchestrator,
verification, trust receipts, product interfaces, and Atlantic
deployment. See `docs\implementation-checklist.md` for progress.