// apps/web/serve.mjs
//
// Tiny static file server for the dashboard SPA. Renders the contents
// of `dist/` with a single-page-app fallback (any path that does not
// match a real file is rewritten to `/index.html`). Binds to the
// port that Render injects as `$PORT`, falling back to 10000 (Render's
// default) or 5173 (the local dev port) for manual use.
//
// Why this exists:
//   Render Blueprints cannot declare a `static` service; static sites
//   are only creatable through the dashboard. To keep the entire
//   deploy 1-click via render.yaml, we run the dashboard as a regular
//   Node Web Service that serves its own dist/ directory. The
//   service is functionally identical to a Render Static Site for
//   this workload: read-only, no backend, low memory.
//
// The server is intentionally dependency-free (only `node:http`,
// `node:fs`, `node:path`) so it does not bloat the web workspace.

import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
// `dist/` sits next to this file in the published output of the
// `vite build` step. We resolve to an absolute path so the
// directory check below is unambiguous.
const DIST = resolve(__dirname, "dist");
const PORT = Number(
  process.env.PORT ?? process.env.WEB_PORT ?? 10000
);
const HOST = process.env.HOST ?? "0.0.0.0";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const DEFAULT_MIME = "application/octet-stream";

/**
 * Resolve a request path under `root` and confirm the result is
 * still inside the root directory. Returns `null` on any traversal
 * attempt. This is the only place we read from disk, so guarding
 * here is sufficient to keep the SPA safe from `..` path attacks.
 */
function safeResolve(root, requested) {
  // Strip the leading slash, append a leading dot so the path
  // resolves as a relative path, and let `resolve` collapse any
  // `..` segments. Then check the result is still under `root`.
  const cleaned = requested.replace(/^\/+/, "");
  const resolved = resolve(root, ".");
  const candidate = resolve(resolved, cleaned);
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (candidate !== root && !candidate.startsWith(rootWithSep)) {
    return null;
  }
  return candidate;
}

function sendFile(res, filePath, contentType, cacheControl) {
  res.writeHead(200, { "content-type": contentType, "cache-control": cacheControl });
  createReadStream(filePath).pipe(res);
}

function sendIndex(res) {
  const indexPath = join(DIST, "index.html");
  try {
    if (statSync(indexPath).isFile()) {
      // index.html must not be cached aggressively so the deploy
      // picks up new bundles immediately.
      sendFile(res, indexPath, MIME[".html"], "no-cache");
      return true;
    }
  } catch {
    /* fall through to 404 */
  }
  return false;
}

function handleRequest(req, res) {
  const rawUrl = req.url || "/";
  // Strip the query string before resolving; otherwise the
  // `?foo=bar` suffix would be treated as part of the path.
  const qIdx = rawUrl.indexOf("?");
  const pathname = (qIdx >= 0 ? rawUrl.slice(0, qIdx) : rawUrl) || "/";

  // Try the requested file first.
  const filePath = safeResolve(DIST, pathname === "/" ? "/index.html" : pathname);
  if (filePath) {
    try {
      const stat = statSync(filePath);
      if (stat.isFile()) {
        const ext = extname(filePath).toLowerCase();
        const contentType = MIME[ext] || DEFAULT_MIME;
        // Hashed assets (vite emits `/assets/index-XXXX.js`) get a
        // 1-year cache; everything else gets a short cache.
        const isHashedAsset = pathname.startsWith("/assets/");
        const cacheControl = isHashedAsset
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600";
        sendFile(res, filePath, contentType, cacheControl);
        return;
      }
    } catch {
      /* fall through to SPA fallback */
    }
  }

  // SPA fallback: any non-file path is served as /index.html.
  if (sendIndex(res)) return;

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
}

const server = createServer(handleRequest);
server.listen(PORT, HOST, () => {
  // eslint-disable-next-line no-console
  console.log(`[pharos-router-web] serving ${DIST} on http://${HOST}:${PORT}`);
});
