# Threat Model

This document enumerates the threats the Pharos Multi-Agent Job
Router must defend against, the mitigations in place, and the
residual risks. It is a non-protected operational document and may
be updated as the project evolves.

## Trust Boundaries

- **User (operator):** submits `JobSpec`, approves jobs, reviews
  receipts. Trusts the API and dashboard to render truthful state.
- **API (Fastify):** public. Treats every request as untrusted.
- **Orchestrator:** runs inside Alibaba Function Compute. Trusts
  the registry, the verifier, and the artifact store.
- **Worker agents:** external, untrusted by default. Receive
  least-privilege task tokens.
- **Verifier agents:** external, untrusted. Must disagree with
  workers for a result to be considered verified.
- **Partner systems:** GoPlus, CertiK, Qwen. Each is treated as a
  *proposal* source, never an authority.
- **Pharos Atlantic:** on-chain store of DAG, assignment, and
  receipt roots. Trust-minimized: the chain is the only source of
  truth for the receipt.

## Threats and Mitigations

### T1: Malicious or compromised worker returns a wrong result

- Mitigation: every result is verified by a verifier selected
  through the same routing engine. The result root only includes
  verified results.
- Detection: `verifier disagree -> record kept; FAILED state`.
- Residual: if all selected verifiers collude, the result is
  untrusted. Diversity enforcement mitigates this.

### T2: Hidden delegation (worker spawns another agent)

- Mitigation: `assertNoHiddenDelegation` in the orchestrator
  (`packages/policy/src/safety.ts`) checks that the
  observed `agentId` is in the declared agent set of the job.
- Residual: if the declaration itself is wrong, the
  check is bypassed. Future work: bind declarations to a signed
  job approval.

### T3: Budget overflow

- Mitigation: budget ledger in
  `packages/policy/src/safety.ts`. `reserveBudget` rejects
  allocations that would push the ledger past its parent budget.
  `settleBudget` reconciles after the task.
- Residual: clock skew could cause a task to start just before
  its deadline and finish after; deadline validation in the
  compiler catches this for the DAG.

### T4: Replay of an old result

- Mitigation: task tokens carry a per-attempt nonce. The result
  includes `submittedAt`. A future result that matches a
  previously seen `(taskId, outputHash)` is rejected.
- Tests: see `packages/workflow/test/workflow.test.ts` and the
  added replay tests under `services/orchestrator/test/`.

### T5: Endpoint substitution attack

- Mitigation: heartbeat endpoint must match the registered
  endpoint. `AgentSkillRegistry.recordHeartbeat` rejects
  mismatches.
- Test: `packages/registry/test/registry.test.ts > rejects
  heartbeats with endpoint substitution`.

### T6: Skill release downgrade

- Mitigation: `activeSkillRelease` is the content hash of a
  release manifest; an agent can only switch releases by
  `updateAgentSkill` which records the new hash. CertiK
  verdicts and `expiresAt` are checked at eligibility time.

### T7: Phishing of human approval

- Mitigation: every human-approval gate is a server-issued
  prompt that the API exposes under `/jobs/:id/approve` and
  `/jobs/:id/execute`. The dashboard renders the explicit
  capability, budget, and target before the user clicks.

### T8: Untrusted content injection in the dashboard

- Mitigation: React escapes by default. The dashboard does not
  call `dangerouslySetInnerHTML`. All partner output is rendered
  as text or as a list of structured fields.

### T9: Wrong network / chain id

- Mitigation: `PharosAtlanticClient` rejects any config whose
  `chainId` is not `688689`. The Hardhat network named
  `atlantic` pins chain id `688689`. The dashboard renders a
  `wrong-network` state when the chain id differs from the
  expected value.

### T10: Stale, low-confidence, or conflicting partner data

- Mitigation: GoPlus verdicts carry `checkedAt`. CertiK verdicts
  carry `certikVerdictAt`. Heartbeats carry `lastHeartbeat`. The
  registry's `isEligible` rejects heartbeats older than 5
  minutes. The dashboard renders stale/unsupported/conflicting
  states for partner data.

### T11: Rate-limit and DoS on the public API

- Mitigation: Fastify rate limit, CORS allow-list, body-size
  limit, structured safe errors. See
  `apps/api/src/server.ts` and the `SecurityConfig` block.

### T12: Secrets leak

- Mitigation: `.env` is git-ignored. `.env.example` contains only
  placeholders. `tools/check-secrets.ps1` and
  `tools/check-secrets.mjs` scan tracked files for `0x64hex`
  patterns and flag them. The server never reads `.env` in tests.

## Residual Risks

- T1 residual: colluding verifiers. Mitigation is diversity
  enforcement; this is not eliminated.
- T9 residual: an operator could deploy against a forked chain.
  The receipt verification in `PharosAtlanticClient.verifyOnChain`
  catches this by comparing the on-chain chain id to 688689.
- T10 residual: a partner system could lie about freshness. The
  router records `checkedAt` and never trusts a partner over its
  own registry.

## Out of Scope

- Compliance, financial regulation, privacy guarantees.
- Recovery from a fully compromised orchestrator host.
- Cross-chain replay (the project is Atlantic-only).