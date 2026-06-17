# Pharos Multi-Agent Job Router Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an independent coordination layer that decomposes complex requests into bounded tasks, selects qualified agents, verifies intermediate outputs, handles retries and disagreement, and produces a verifiable final job receipt.

**Architecture:** A deterministic workflow compiler converts an approved job specification into a DAG. A capability registry and scoring engine select agents using capability, cost, latency, trust, and availability; Qwen may propose decomposition but cannot authorize execution. GoPlus checks transaction targets, CertiK verdicts constrain eligible skills, Alibaba Cloud runs orchestrators, and Pharos anchors assignment and completion receipts.

**Tech Stack:** TypeScript, Fastify, PostgreSQL, workflow engine, viem, Solidity, React/Vite, Alibaba Function Compute/Model Studio, GoPlus, CertiK.

---

## Product Contract

- Inputs: typed goal, constraints, budget, deadline, allowed tools/chains, verification policy.
- Outputs: approved DAG, assignments, evidence-backed task results, aggregate result, receipt.
- Task states: `PLANNED`, `READY`, `ASSIGNED`, `RUNNING`, `SUBMITTED`, `VERIFIED`, `FAILED`, `CANCELLED`.
- Router never grants an agent more permissions than the task requires.
- MVP supports deterministic DAGs, bounded retries, human approval gates, capability discovery, result verification, and receipt anchoring.
- Out of scope: unrestricted agent self-spawning, hidden delegation, automatic financial execution without policy approval.

## Models

```ts
interface JobSpec { jobId:string; goalHash:`0x${string}`; budgetMicrousd:bigint; deadline:number; allowedCapabilities:string[]; policyHash:`0x${string}`; verifier:string }
interface TaskSpec { taskId:string; dependencies:string[]; capability:string; inputHash:`0x${string}`; budgetMicrousd:bigint; deadline:number; verifier:string }
interface AssignmentReceipt { taskId:string; agentId:string; skillReleaseHash:`0x${string}`; score:number; assignedAt:number; termsHash:`0x${string}` }
```

## Repository Map

```text
apps/api, apps/web, services/orchestrator, services/verifier
packages/workflow, packages/registry, packages/routing, packages/policy, packages/contracts, packages/sdk
```

### Task 0: Initialize And Specify Coordination Safety

- [ ] Create standalone namespace `@pharos-router/*`.
- [ ] Define permission propagation, budget accounting, cancellation, retries, and human approvals.
- [ ] Define trusted/untrusted result boundaries and no-hidden-delegation rule.
- [ ] Commit `chore: initialize multi agent router`.

### Task 1: Define Job, DAG, Assignment, And Receipt Schemas

- [ ] Create strict schemas and deterministic hashes.
- [ ] Reject cycles, unreachable tasks, excessive permissions, invalid budgets, and unsafe deadlines.
- [ ] Define task/result verifier contracts and aggregate receipt format.
- [ ] Commit `feat: define multi agent job protocol`.

### Task 2: Implement Workflow Compiler

- [ ] Build deterministic compiler from approved structured spec to DAG.
- [ ] Add optional Qwen proposal step whose output must validate and receive approval.
- [ ] Calculate critical path, budget allocations, and approval gates.
- [ ] Test decomposition injection, cycles, budget overflow, and unsupported capability.
- [ ] Commit `feat: add bounded workflow compiler`.

### Task 3: Implement Agent And Skill Registry

- [ ] Register capabilities, endpoints, pricing, availability, identity, and release hashes.
- [ ] Attach CertiK scan verdict and reject failed/expired skill releases.
- [ ] Track signed heartbeats and prevent endpoint substitution.
- [ ] Commit `feat: add agent capability registry`.

### Task 4: Implement Selection And Routing Engine

- [ ] Score candidates by capability fit, trust, cost, latency, availability, and prior success.
- [ ] Make weights explicit and return explanation.
- [ ] Enforce diversity/anti-collusion rules for verifier and worker selection.
- [ ] Commit `feat: add explainable agent routing`.

### Task 5: Implement Orchestrator

- [ ] Execute only ready tasks, issue least-privilege task tokens, and checkpoint state.
- [ ] Add timeout, bounded retry, reassignment, cancellation, and restart recovery.
- [ ] Account for budget before and after every task.
- [ ] Commit `feat: add resilient multi agent orchestrator`.

### Task 6: Implement Result Verification And Aggregation

- [ ] Support schema, hash, deterministic computation, transaction, and human verification.
- [ ] Reject unverifiable results and record disagreement evidence.
- [ ] Aggregate only verified dependency results.
- [ ] Commit `feat: add result verification pipeline`.

### Task 7: Implement Trust Integrations And Pharos Receipts

- [ ] Use GoPlus before tasks propose risky token/address/approval interactions.
- [ ] Create on-chain registry for assignment and terminal job receipt hashes.
- [ ] Store DAG/result artifacts off-chain with content hashes.
- [ ] Commit `feat: add routed job trust receipts`.

### Task 8: Build SDK, API, MCP, And Dashboard

- [ ] Expose create, approve, route, execute, verify, cancel, retry, and inspect operations.
- [ ] Visualize DAG, permissions, candidates, scores, budgets, evidence, and receipts.
- [ ] Require explicit confirmation for financial/write tasks.
- [ ] Commit `feat: add router product interfaces`.

### Task 9: Cloud Deployment And Atlantic Acceptance

- [ ] Deploy isolated orchestrator/verifier/API services on Alibaba Cloud.
- [ ] Deploy receipt contracts with new Atlantic wallets.
- [ ] Demonstrate successful multi-agent job, failed worker reassignment, verifier disagreement, budget rejection, risky-target rejection, and final receipt verification.
- [ ] Commit `feat: deploy multi agent router`.

## Definition Of Done

Complete when a complex job is decomposed into an approved acyclic plan, routed only to qualified and scanned agents with least privilege, recovered from a worker failure, verified step-by-step, kept within budget, and finalized with an independently verifiable Pharos receipt.
