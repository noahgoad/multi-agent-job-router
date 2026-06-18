# Deploying the API to Railway

The API is a long-running Fastify service. Render's free tier sleeps the
service after 15 minutes of inactivity, which makes the first request
after a wake-up take ~30 seconds. Railway's free / hobby plan keeps the
service always-on, so the dashboard polls land instantly.

## Architecture (after migration)

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Vercel (CDN, edge)          │         │  Railway (always-on Node)    │
│  ─ apps/web (Vite SPA)       │  HTTPS  │  ─ apps/api (Fastify)        │
│  ─ assets/ from dist/        │ ──────► │  ─ services/orchestrator     │
│  ─ no backend                │ Bearer  │  ─ in-memory JobStore        │
└──────────────────────────────┘         └──────────────────────────────┘
```

The web dashboard (Vercel) and the API (Railway) are decoupled. The
dashboard polls the API; the API anchors receipts on Pharos Atlantic.

## One-time setup

### 1. Sign up

```bash
# Web: https://railway.app → Sign up with GitHub
# Or via CLI:
npm i -g @railway/cli
railway login
```

### 2. Create a project

In the Railway dashboard:

1. Click **"New Project"**
2. Choose **"Deploy from GitHub repo"**
3. Select the repository (e.g. `tuyenlethanh204-ctrl/multi-agent-job-router`)
4. Railway will auto-detect the Node project, read `railway.toml`, and
   start the first build

If the repo is not yet on GitHub, use the CLI from your local working tree:

```bash
# from the repo root
railway init              # creates a project
railway up                # deploys the current directory
```

### 3. Set environment variables

In **Project → Service → Variables**, add the following. **Do not commit
secrets** — set them in the dashboard only.

| Key | Value | Notes |
|---|---|---|
| `PHAROS_ROUTER_DEMO` | `1` | Enables demo seed on boot |
| `PHAROS_ROUTER_AUTO_SEED` | `1` | Re-creates `demo` job on empty store |
| `PHAROS_ROUTER_AUTH_TOKEN` | `<32-byte hex>` | Run `openssl rand -hex 32` to generate. **Required.** |
| `CORS_ORIGINS` | `https://pharos-router-web.vercel.app,https://your-custom-domain.com` | Comma-separated allow-list. **Required.** |
| `API_HOST` | `0.0.0.0` | Bind on all interfaces |
| `API_PORT` | `${{PORT}}` | Reference Railway's injected `$PORT` (defaults to 3000). The API code reads `API_PORT` first, falling back to `8787`. Using `${{PORT}}` makes the app bind to whatever port Railway exposes. |
| `NODE_ENV` | `production` | |
| `PHAROS_CHAIN_ID` | `688689` | Pharos Atlantic |
| `PHAROS_RPC_URL` | `https://atlantic.dplabs-internal.com` | Atlantic RPC |
| `PHAROS_REGISTRY_ADDRESS` | `0xb11191DE716B6933E1Efac359AE9C0287c16a187` | Deployed `JobRouterRegistry` (mainnet) |
| `ROUTER_DEPLOYER_PRIVATE_KEY` | `<hex>` | **Secret** — the deployer key for `recordAssignment` / `finalizeReceipt`. Set in dashboard only. |
| `PHAROS_REGISTRY_ADDRESS` (testnet) | `<different address>` | If you redeployed to testnet, use that address |
| `QWEN_API_KEY` | `<Alibaba DashScope key>` | Optional — only needed for `qwen-assisted` mode |
| `GOPLUS_API_KEY` | `<key>` | Optional — only needed for `tx` capability tasks |
| `CERTIK_API_KEY` | `<key>` | Optional — only needed for fresh skill releases |

> **Port binding:** Railway injects a `$PORT` env var (defaults to
> 3000). Set `API_PORT=${{PORT}}` so the API binds to whatever port
> Railway has exposed. The literal value `3000` also works if you
> prefer; Railway's default is 3000.

### 4. Add a healthcheck (already in railway.toml)

```toml
[deploy]
healthcheckPath = "/healthz"
```

Railway will ping this URL every 30 s. If the service stops responding,
Railway restarts it (subject to `restartPolicyMaxRetries = 10`).

### 5. Generate a public domain

In **Settings → Networking → Public Networking → "Generate Domain"**,
Railway gives you a URL like `https://pharos-router-api-production.up.railway.app`.

Note this URL — you'll need it for the Vercel env var.

## After the API is live

### 1. Update the Vercel env var

The Vite bundle inlines the API URL at build time. Update `VITE_API_BASE`
in the Vercel project to the new Railway URL:

```bash
vercel env rm VITE_API_BASE production
vercel env add VITE_API_BASE production
# paste: https://pharos-router-api-production.up.railway.app
```

Then redeploy the Vercel project:

```bash
vercel --prod
```

### 2. (Optional) Remove the Render service

Once the Railway API is stable, you can delete the Render service to stop
paying for two hosts:

- Render dashboard → `pharos-router-api-jrst` → Settings → "Delete Service"

The Vercel dashboard does **not** call Render anymore after step 1.

## Build flow in detail

`railway.toml` at the repo root declares:

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm ci --include=dev && npm run build"

[deploy]
startCommand = "node apps/api/dist/src/main.js"
```

The build proceeds in three steps:

1. **Nixpacks detection** — Railway sees `package.json` and infers Node.js
   (the version is pinned via `.nvmrc` at the repo root).
2. **`npm ci --include=dev`** — installs every workspace package, including
   the local `@pharos-router/sdk`, `@pharos-router/workflow`, etc.
   `--include=dev` is required because TypeScript lives in devDependencies.
3. **`npm run build`** — runs `tsc -b`, which builds every package in
   dependency order. After this step, `apps/api/dist/src/main.js` exists.
4. **`node apps/api/dist/src/main.js`** — starts the API on the port
   specified by `API_PORT` (default 3000).

## Continuous deployment

Railway watches the GitHub repo and redeploys on every push to `main`.
Pull requests get unique preview URLs (requires Railway's "PR Deployments"
feature, enabled by default on the Pro plan).

To roll back, use the Railway dashboard: **Deployments → click a previous
deployment → "Redeploy"**.

## Local sanity check

Before pushing, mirror the Railway build locally to catch type errors:

```bash
# from repo root
rm -rf apps/api/dist packages/*/dist services/*/dist
npm ci --include=dev
npm run build
node apps/api/dist/src/main.js
```

The API should start on port 3000. Hit `http://127.0.0.1:3000/healthz` to
confirm liveness.

## Cost

Railway's hobby plan is **$5 of usage credit per month**, enough for one
always-on Node service. The API uses ~256 MB RAM and idle CPU, well under
the credit limit. If you exceed the credit, Railway pauses the service
(doesn't delete it) until the next month.

This is roughly the same cost as Render's $7/mo paid plan, but the
service is always-on (no sleep) and the free Render tier is being
discontinued in late 2024 — Railway is the cleaner long-term home.

## When NOT to use Railway

- **You need a persistent disk for `FileStorage`** — Railway removed
  volumes on the new usage plan (2024). The free-tier workaround
  (`PHAROS_ROUTER_AUTO_SEED=1`) re-seeds the demo job on every cold
  start, which is acceptable for a demo. For real persistence, use a
  hosted Postgres (Neon, Supabase, Railway Postgres) and refactor
  `JobStore` to read from it — this is on the roadmap but not yet
  implemented.
- **You need multiple regions / edge presence** — Railway runs in a
  single region per service. For multi-region, use Fly.io or a
  self-hosted cluster.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails with "Cannot find module" | `npm ci` ran without `--include=dev` | Confirm `buildCommand` in `railway.toml` includes `--include=dev` |
| Build fails with "tsc: command not found" | TypeScript skipped (devDep) | Same as above — `npm ci --include=dev` is mandatory |
| API starts but exits immediately | `API_PORT` mismatch with Railway's `$PORT` | Set `API_PORT=${{PORT}}` in env (Railway's variable reference syntax) |
| Dashboard gets 403 cors_origin_denied | Vercel origin not in `CORS_ORIGINS` | Update `CORS_ORIGINS` in Railway env, redeploy |
| Dashboard gets 401 | Wrong or missing `?authToken=` | Use the token from Railway env (`PHAROS_ROUTER_AUTH_TOKEN`) |
| API restarts repeatedly | `healthcheckPath` returning non-200 | Check `/healthz` returns `{ ok: true, time: <epoch> }`; tail logs in Railway dashboard |
| On-chain anchoring fails | `ROUTER_DEPLOYER_PRIVATE_KEY` missing or wrong | Set in Railway env (never commit). Test with `scripts/atlantic-acceptance/f.mjs` |
