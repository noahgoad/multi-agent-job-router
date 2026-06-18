# Deploying the dashboard to Vercel

The web dashboard (`apps/web`) is a Vite + React SPA. The dashboard is
hosted on Vercel's global CDN for fast first-paint anywhere in the world,
while the long-running API orchestrator stays on **Railway** (see
`docs/deployment/railway.md` for that side of the migration).

## Architecture

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Vercel (CDN, edge)          │         │  Railway (always-on Node)    │
│  ─ apps/web (Vite SPA)       │  HTTPS  │  ─ apps/api (Fastify)        │
│  ─ assets/ from dist/        │ ──────► │  ─ services/orchestrator     │
│  ─ no backend                │ Bearer  │  ─ in-memory JobStore        │
└──────────────────────────────┘         └──────────────────────────────┘
```

The two halves are decoupled: the dashboard polls the API; the API anchors
receipts on Pharos Atlantic. See [`docs/deployment/railway.md`](railway.md)
for the API side.

## One-time setup

### 1. Install the Vercel CLI

```bash
npm i -g vercel
vercel login          # opens browser, sign in
```

### 2. Link the project

From the repo root:

```bash
vercel link
```

Vercel will create a `.vercel/` directory. Pick **"Link to existing project"**
if you've already created the project in the Vercel dashboard, or **"Create
new project"** otherwise. Use project name `pharos-router-web` for
consistency with the package name.

### 3. Set the build-time environment variable

The web bundle inlines the API base URL at build time. Set it via the
dashboard (Project → Settings → Environment Variables) or CLI:

```bash
# Production value
vercel env add VITE_API_BASE production
# paste: https://pharos-router-api-jrst.onrender.com   (or your custom API domain)

# Preview deployments can use a different API
vercel env add VITE_API_BASE preview
# paste: https://pharos-router-api-staging.onrender.com
```

> **Do not** put a trailing slash. The SDK concatenates paths.
> **Do not** include `?authToken=...` here — the token is supplied by the
> user in the dashboard URL, not at build time.

## Deploy

### Production

```bash
vercel --prod
```

The CLI will:
1. Run `npm ci --include=dev` (installCommand)
2. Run `npm run build && cd apps/web && npx vite build` (buildCommand)
3. Publish the contents of `apps/web/dist` (outputDirectory)
4. Give you a URL like `https://pharos-router-web.vercel.app`

### Preview (per branch / per PR)

```bash
git checkout -b feat/some-change
git commit -am "..."
vercel
```

Each non-main branch gets a unique preview URL.

## After the first deploy

### 1. Add the Vercel origin to the API's CORS allow-list

The API on Railway reads `CORS_ORIGINS` as a comma-separated list. After
your first Vercel deploy, set this in the Railway dashboard
(**Service → Variables**), not in code:

```
CORS_ORIGINS=https://pharos-router-web.vercel.app,https://your-custom-domain.com
```

The placeholder `https://pharos-router-web.vercel.app` is set when you
first run `vercel --prod` — replace it with the URL Railway gets back.
Railway redeploys on the next variable save.

### 2. Open the dashboard

```
https://pharos-router-web.vercel.app/?jobId=demo&authToken=<token from Railway>
```

The token is the value of `PHAROS_ROUTER_AUTH_TOKEN` in the Railway
dashboard (Variables tab of the API service). The auto-seed flag
(`PHAROS_ROUTER_AUTO_SEED=1`) re-creates the `demo` job on empty stores,
so a fresh Railway cold start still serves a working demo.

## Build flow in detail

`vercel.json` at the repo root declares:

```json
{
  "buildCommand": "npm run build && cd apps/web && npx vite build",
  "outputDirectory": "apps/web/dist",
  "installCommand": "npm ci --include=dev"
}
```

The build proceeds in three steps:

1. **`npm ci --include=dev`** at the repo root — installs every workspace
   package and links the local `@pharos-router/sdk` via npm workspaces.
   `--include=dev` is required because TypeScript, Vite, and Vitest all
   live in devDependencies. (Vercel sets `NODE_ENV=production` in the
   build environment; without `--include=dev`, devDependencies are
   skipped.)
2. **`npm run build`** at the repo root — runs `tsc -b`, which builds
   every package in dependency order. After this step,
   `packages/sdk/dist/src/index.js` exists, so Vite can resolve
   `@pharos-router/sdk` via the workspace symlink.
3. **`npx vite build`** in `apps/web` — produces the SPA bundle in
   `apps/web/dist/`. Vercel publishes that directory.

## Continuous deployment

Vercel watches the GitHub repo and redeploys on every push to `main`
(declared in `vercel.json` under `git.deploymentEnabled.main`). Pull
requests get unique preview URLs.

## Local sanity check

Before pushing, mirror the Vercel build locally to catch type errors and
broken workspace links:

```bash
# from repo root
rm -rf apps/web/dist packages/sdk/dist
npm ci --include=dev
npm run build
cd apps/web && npx vite build
```

The `dist/` output should appear in `apps/web/`. If `vite` complains about
`@pharos-router/sdk`, the workspace symlink was lost — re-run
`npm install` at the repo root.

## Rollback

Vercel keeps every deployment. To roll back to a previous build:

```bash
vercel rollback              # interactive: pick a deployment
vercel rollback <deployment-url>
```

## Cost

Vercel's hobby plan is free and covers this dashboard:

- 100 GB bandwidth / month
- 6,000 build minutes / month
- Unlimited preview deployments

The dashboard bundle is ~65 kB gzipped, so 100 GB is roughly 1.5 M page
loads per month. Way more than the demo needs.

## When NOT to use Vercel

- **The API cannot be hosted on Vercel serverless** — the orchestrator is
  a long-running process (per-task runner, GoPlus/CertiK bridges, receipt
  anchoring). Serverless functions time out at 10 s on the hobby plan. The
  API stays on Railway; see [`docs/deployment/railway.md`](railway.md).
- **If you need a persistent disk for `FileStorage`** — Railway's new
  usage-based plan removed persistent volumes (2024). The free-tier
  workaround (`PHAROS_ROUTER_AUTO_SEED=1`) re-seeds the demo on every
  cold start, which is acceptable for a demo. For real persistence, use
  hosted Postgres (Neon, Supabase) and refactor `JobStore` to read from
  it — on the roadmap but not yet implemented.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Build fails with "Cannot find module @pharos-router/sdk" | Workspace symlink missing | `rm -rf node_modules && npm install` at repo root |
| Build fails with "tsc: command not found" | Render-style NODE_ENV=production skipping devDeps | Confirm `installCommand` includes `--include=dev` |
| Dashboard loads but API calls return 403 cors_origin_denied | Vercel origin not in `CORS_ORIGINS` | Edit `render.yaml`, commit, push — Render will redeploy |
| Dashboard loads but API calls return 401 | Wrong or missing `?authToken=` | Use the auto-generated token from Render's Environment tab |
| Build succeeds but `dist/` is empty | Wrong `outputDirectory` in `vercel.json` | Should be `apps/web/dist` (relative to repo root) |
| Bundle inlines wrong API URL | `VITE_API_BASE` not set for the right environment | Set it under Project → Settings → Environment Variables for `production` / `preview`. Use the Railway URL, not Render. |
| Dashboard gets 403 cors_origin_denied | Vercel origin not in Railway's `CORS_ORIGINS` | Edit the env var in the Railway dashboard (Service → Variables), not `render.yaml` |
