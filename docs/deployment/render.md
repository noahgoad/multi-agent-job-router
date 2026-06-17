# Deploying to Render

This guide walks through deploying the Pharos Multi-Agent Job Router to [Render](https://render.com) as two services backed by one GitHub repository.

> **Why Render?** Render supports persistent disks on the free tier, which the API needs for `FileStorage` (`jobs.json`). Serverless platforms (Vercel, Netlify Cloud Functions) do not provide a persistent filesystem, so the in-place `FileStorage` would lose data after every cold start.

## 0. Prerequisites

- A GitHub account with admin access to the repo (the project should already be pushed — see step 1).
- A Render account (sign in with GitHub at <https://render.com>).
- A random `PHAROS_ROUTER_AUTH_TOKEN`. Generate one locally:

  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```

  Save it — Render will hide it after the first save.

## 1. Push to GitHub

If the repo is not on GitHub yet:

```bash
git init -b main
git add -A
git commit -m "Initial commit"
gh repo create multi-agent-job-router --private --source=. --remote=origin --push
```

Verify at <https://github.com/<your-username>/multi-agent-job-router>.

## 2. Create the API Web Service

In the Render dashboard: **New + → Web Service → Connect to GitHub → pick the repo**.

| Field | Value |
|-------|-------|
| Name | `pharos-router-api` |
| Region | `Oregon` (or closest to you) |
| Branch | `main` |
| Runtime | `Node` |
| Build command | `npm ci && npm run build` |
| Start command | `PHAROS_ROUTER_DATA_DIR=/var/data PHAROS_ROUTER_AUTH_TOKEN=$PHAROS_ROUTER_AUTH_TOKEN node apps/api/dist/src/main.js` |
| Instance type | `Free` |
| Health check path | `/healthz` |

### Persistent disk

Scroll to **Disks** and add:

| Field | Value |
|-------|-------|
| Name | `pharos-data` |
| Mount path | `/var/data` |
| Size | `1 GB` |

### Environment variables

In **Environment → Add environment variable**:

| Key | Value |
|-----|-------|
| `PHAROS_ROUTER_DATA_DIR` | `/var/data` |
| `PHAROS_ROUTER_AUTH_TOKEN` | *(paste the hex from step 0)* |

Optional but recommended:

| Key | Value |
|-----|-------|
| `PHAROS_RPC_URL` | `https://atlantic.dplabs-internal.com` |
| `PHAROS_CHAIN_ID` | `688689` |
| `PHAROS_EXPLORER_URL` | `https://atlantic.pharosscan.xyz` |
| `CORS_ORIGINS` | `https://pharos-router-web.onrender.com` |

> ⚠️ The default CORS allow-list is `http://127.0.0.1:5173, http://localhost:5173`. If you do not extend it, the deployed web will fail CORS on every request. Render does not yet pass a custom CORS list through to Fastify, so you may need to either (a) bake it into a new `SecurityConfig` at boot, or (b) make the API itself emit `Access-Control-Allow-Origin: *` for the Render domain. See "CORS for the deployed web" below.

Click **Create Web Service**. The first build takes ~3–5 minutes (full monorepo build).

Once the service is `Live`, smoke-test it:

```bash
curl https://pharos-router-api.onrender.com/healthz
# → {"ok":true,"time":1718xxxx}
```

## 3. Create the Web Static Site

> **Why this looks different from the API section:** Render Blueprints cannot declare a `static` service — the type is rejected with `unknown type 'static'`. To keep the Blueprint 1-click, `render.yaml` declares the dashboard as a regular Node Web Service that runs `apps/web/serve.mjs`, a tiny dependency-free static file server with SPA fallback. The runtime is functionally identical to a Render Static Site for this workload (read-only, no backend, low memory).
>
> If you'd rather use a true Render Static Site, create it manually: **New + → Static Site → connect the same repo → Build command: `npm ci && npm run build && cd apps/web && npx vite build` → Publish directory: `apps/web/dist`**.

In the Render dashboard: **New + → Web Service → connect the same repo**.

| Field | Value |
|-------|-------|
| Name | `pharos-router-web` |
| Region | `Oregon` (must match the API for `fromService` to work) |
| Branch | `main` |
| Runtime | `Node` |
| Build command | `npm ci && npm run build && cd apps/web && npx vite build` |
| Start command | `node apps/web/serve.mjs` |
| Instance type | `Free` |
| Health check path | `/` |

### Environment variables (build-time)

| Key | Value |
|-----|-------|
| `VITE_API_BASE` | `https://pharos-router-api.onrender.com` |

### Rewrite rules

In **Redirects/Rewrites** add:

| Source | Destination | Action |
|--------|-------------|--------|
| `/*` | `/index.html` | `Rewrite` |

Click **Create Static Site**. The build also takes ~3–5 minutes.

## 4. CORS for the deployed web

Two clean options:

### Option A — bake the Render origin into `DEFAULT_SECURITY` (recommended for one Render host)

Edit `apps/api/src/server.ts`:

```ts
export const DEFAULT_SECURITY: Required<SecurityConfig> = {
  // ...
  corsOrigins: [
    "http://127.0.0.1:5173",
    "http://localhost:5173",
    "https://pharos-router-web.onrender.com", // <-- add this
  ],
  // ...
};
```

Commit, push, Render auto-redeploys.

### Option B — make CORS env-driven

Read `PHAROS_ROUTER_CORS_ORIGINS` (comma-separated) at boot and pass it through `SecurityConfig`. Then set the env var in the Render dashboard without a code change.

## 5. Seed the demo job

The dashboard is empty by default. To populate the demo job on first visit, hit the API once from your workstation:

```bash
curl -X POST https://pharos-router-api.onrender.com/jobs \
  -H "Authorization: Bearer $PHAROS_ROUTER_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  --data @scripts/seed-demo.mjs  # or paste the body inline
```

Easier: open the dashboard, copy the seed payload from `scripts/seed-demo.mjs`, POST it manually with `?authToken=<your token>` set as a URL param.

> ⚠️ The dashboard's `authToken` URL parameter is a dev convenience. In a real deployment, switch the web to read the token from a cookie or a server-side proxy that injects the header.

## 6. Verify

Open the dashboard URL and confirm:

- [ ] The 4 tasks render in the left rail.
- [ ] Auto-play runs through PLANNED → ASSIGNED → RUNNING → VERIFIED in ~6 s.
- [ ] A page reload after the run shows the same terminal state (FileStorage persistence works).
- [ ] No `403 cors_origin_denied` in the browser console.
- [ ] `GET /jobs/demo` from the browser returns a fully-populated `JobReceipt`.

## 7. Cost & limits

| Service | Free tier | Cold start | Notes |
|---------|-----------|------------|-------|
| Web Service | 750 h/mo, sleeps after 15 min idle | ~30 s on first wake | enough for demos |
| Static Site | 100 GB bandwidth/mo | n/a (CDN) | always warm |
| Persistent disk | 1 GB free | n/a | bound to the Web Service lifecycle |

For a continuously-warm demo, upgrade the Web Service to a paid plan or wire an external uptime pinger (e.g. <https://uptimerobot.com>) to hit `/healthz` every 14 minutes.
