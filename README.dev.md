# Pharos Multi-Agent Job Router

Coordination layer that decomposes approved jobs into bounded tasks,
selects qualified agents, verifies intermediate results, and produces
verifiable final receipts anchored on Pharos.

## Repository Layout

```
.
+-- apps/
|   +-- api/        Fastify HTTP service
|   +-- web/        React + Vite dashboard
|   +-- mcp/        Model Context Protocol server
+-- services/
|   +-- orchestrator/  Resilient task runner
|   +-- verifier/      Verifier pipeline and aggregator
+-- packages/
|   +-- policy/        Coordination safety specification
|   +-- workflow/      Schemas, hashes, compiler, Qwen proposer
|   +-- registry/      Agent and skill registry with CertiK gating
|   +-- routing/       Weighted selection + explainable scoring
|   +-- contracts/     Solidity + Pharos Atlantic client
|   +-- sdk/           Typed TypeScript client
+-- scripts/           Deployment and acceptance scripts
+-- tools/             Static verification utilities
+-- docs/              Operational documentation
```

## Quickstart

```bash
# 1. Install dependencies
npm ci

# 2. Typecheck
npm run typecheck

# 3. Lint
npm run lint

# 4. Run all tests
npm test

# 5. Build
npm run build

# 6. Run static checks (protected-file hashes, isolation, secret scan)
npm run verify

# Or on Windows PowerShell:
.\tools\verify.ps1
```

## Configuration

Copy `.env.example` to `.env` and fill in the placeholders. The
`.env` file is git-ignored; never commit secrets. Required
configuration:

- `PHAROS_RPC_URL` - Pharos Atlantic RPC.
- `PHAROS_CHAIN_ID` - must be `688689`.
- `PHAROS_REGISTRY_ADDRESS` - the deployed `JobRouterRegistry`
  contract.
- `ROUTER_DEPLOYER_PRIVATE_KEY` - the deployer key. Local-only.
- `DATABASE_URL` - PostgreSQL connection string.
- `GOPLUS_API_KEY`, `CERTIK_API_KEY`, `QWEN_API_KEY` - partner
  integration keys.

## Atlantic Deployment

See `docs/atlantic-acceptance-scenarios.md` for the full scenario
list. Each scenario has a corresponding shell script in
`scripts/atlantic-acceptance/`. Results are recorded in
`docs/atlantic-acceptance-results.md`.

## Operational Documentation

- `docs/implementation-context.md` - architecture summary.
- `docs/isolation-verification.md` - workspace isolation proof.
- `docs/plan-preservation-manifest.md` - protected-file hashes.
- `docs/implementation-checklist.md` - working progress checklist.
- `docs/change-log.md` - manual change log (no Git in sandbox).
- `docs/environment-status.md` - toolchain status.
- `docs/atlantic-acceptance-scenarios.md` - acceptance scenarios.
- `docs/atlantic-acceptance-results.md` - acceptance results.
- `docs/local-acceptance-results.md` - local verification results.
- `docs/plan-preservation-final-report.md` - final preservation
  status.