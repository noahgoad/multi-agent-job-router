import Fastify, { type FastifyInstance } from "fastify";
import { join as pathJoin } from "node:path";
import { buildApp, JobStore, view, type AppDeps } from "./app.js";
import { AgentSkillRegistry } from "@pharos-router/registry";
import { ArtifactStore } from "@pharos-router/workflow";
import { FileStorage } from "./storage.js";

const path = { join: pathJoin };

/**
 * Pharos Multi-Agent Job Router API.
 *
 * Exposes:
 *   POST /jobs                    create
 *   POST /jobs/:id/approve        approve
 *   POST /jobs/:id/route          route
 *   POST /jobs/:id/execute        execute
 *   POST /jobs/:id/verify         verify
 *   POST /jobs/:id/cancel         cancel
 *   POST /jobs/:id/retry          retry
 *   GET  /jobs/:id                inspect
 *   GET  /jobs                    list
 *   GET  /healthz                 health
 *
 * Security posture:
 *   - Body-size limit per request (default 1 MiB).
 *   - Explicit CORS allow-list (default localhost-only).
 *   - Bearer-token authentication for all /jobs routes
 *     (default token `dev-token`; the operator must override it
 *     in production).
 *   - Structured safe errors that never echo secrets.
 *   - Per-route rate limit on writes.
 */

export interface SecurityConfig {
  readonly bodyLimitBytes?: number;
  readonly corsOrigins?: ReadonlyArray<string>;
  readonly authToken?: string;
  readonly rateLimitPerMinute?: number;
  readonly logger?: boolean;
}

export const DEFAULT_SECURITY: Required<SecurityConfig> = {
  bodyLimitBytes: 1_048_576,
  corsOrigins: ["http://127.0.0.1:5173", "http://localhost:5173"],
  authToken: "dev-token",
  rateLimitPerMinute: 60,
  logger: false,
};

export interface ServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly deps?: Partial<AppDeps>;
  readonly security?: SecurityConfig;
}

export async function buildServer(
  options: ServerOptions = {}
): Promise<FastifyInstance> {
  const sec = { ...DEFAULT_SECURITY, ...(options.security ?? {}) };
  const fastify = Fastify({
    logger: sec.logger,
    bodyLimit: sec.bodyLimitBytes,
    trustProxy: false,
  });

  // Custom JSON parser that revives decimal-string bigints that
  // were tagged with a trailing `n` by the test helper. This is
  // safe because the magic suffix is not a valid JSON value.
  fastify.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (req, body, done) => {
      try {
        const text = body as string;
        if (text.length === 0) {
          done(null, {});
          return;
        }
        const parsed = JSON.parse(text, (_k, v) => {
          if (typeof v === "string" && /^[0-9]+n$/.test(v)) {
            return BigInt(v.slice(0, -1));
          }
          return v;
        });
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // BigInt-safe response helper. Many of our route handlers
  // return objects that contain BigInt values (budgets, hashes,
  // etc.). Fastify's default JSON serializer cannot handle
  // BigInts and the per-route serializer compiler only fires
  // when a JSON schema is attached (which our routes do not
  // declare). We pre-serialize the response to a JSON string
  // with a BigInt replacer before handing it to Fastify.
  const bigintReplacer = (_k: string, v: unknown): unknown =>
    typeof v === "bigint" ? v.toString() : v;
  const bigintSafe = async <T>(fn: () => Promise<T> | T): Promise<string> => {
    const v = await fn();
    return JSON.stringify(v, bigintReplacer);
  };

  // CORS allow-list.
  //
  // Browsers issue a CORS preflight (OPTIONS) before any cross-origin
  // request that uses non-simple headers (e.g. `Authorization: Bearer
  // ...`). The preflight must come back as 2xx with the right
  // `Access-Control-Allow-*` headers, otherwise the browser refuses to
  // send the real request ("Failed to fetch"). We short-circuit OPTIONS
  // here so it never falls through to the 404 fallback.
  fastify.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (typeof origin !== "string") return;
    const allowed = sec.corsOrigins.includes(origin);
    if (!allowed) {
      reply.header("vary", "origin");
      if (
        req.method !== "GET" &&
        req.method !== "HEAD" &&
        req.method !== "OPTIONS"
      ) {
        reply.code(403);
        return reply.send({ error: "cors_origin_denied" });
      }
      return;
    }
    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-credentials", "true");
    reply.header("vary", "origin");
    if (req.method === "OPTIONS") {
      reply.header("access-control-allow-methods", "GET, POST, OPTIONS");
      reply.header(
        "access-control-allow-headers",
        req.headers["access-control-request-headers"] ??
          "content-type, authorization"
      );
      reply.header("access-control-max-age", "600");
      reply.code(204);
      return reply.send();
    }
  });

  // Bearer-token auth for /jobs/*.
  fastify.addHook("onRequest", async (req, reply) => {
    if (!req.url.startsWith("/jobs")) return;
    if (req.method === "OPTIONS") return;
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer ")) {
      reply.code(401);
      return reply.send({ error: "missing_bearer_token" });
    }
    if (auth.slice("Bearer ".length) !== sec.authToken) {
      reply.code(401);
      return reply.send({ error: "invalid_bearer_token" });
    }
  });

  // Per-route rate limit on writes.
  const writeBuckets = new Map<string, { count: number; resetAt: number }>();
  fastify.addHook("onRequest", async (req, reply) => {
    if (
      req.method === "GET" ||
      req.method === "HEAD" ||
      req.method === "OPTIONS"
    )
      return;
    const ip = req.ip || "unknown";
    const now = Date.now();
    const b = writeBuckets.get(ip);
    if (!b || b.resetAt < now) {
      writeBuckets.set(ip, { count: 1, resetAt: now + 60_000 });
      return;
    }
    b.count += 1;
    if (b.count > sec.rateLimitPerMinute) {
      reply.code(429);
      return reply.send({ error: "rate_limited" });
    }
  });

  const fileStorage =
    process.env.PHAROS_ROUTER_DATA_DIR && !options.deps?.store
      ? new FileStorage(
          path.join(process.env.PHAROS_ROUTER_DATA_DIR, "jobs.json")
        )
      : null;
  const store = options.deps?.store ?? new JobStore({ storage: fileStorage });
  const registry = options.deps?.registry ?? new AgentSkillRegistry();
  const artifact = options.deps?.artifact ?? new ArtifactStore();
  const now = options.deps?.now ?? (() => Math.floor(Date.now() / 1000));
  const humanApprove = options.deps?.humanApprove ?? (async () => true);
  const atlantic = options.deps?.atlantic;
  const deps: AppDeps = {
    store,
    registry,
    artifact,
    humanApprove,
    now,
    ...(atlantic ? { atlantic } : {}),
  };
  const app = buildApp(deps);

  // Safe error mapping: never echo stack traces or secrets.
  // Honour any HTTP status that the underlying error carried
  // (e.g. FST_ERR_CTP_BODY_TOO_LARGE -> 413).
  fastify.setErrorHandler((err, _req, reply) => {
    const errStatus = (err as Error & { statusCode?: number }).statusCode;
    const status =
      errStatus && errStatus >= 400
        ? errStatus
        : reply.statusCode >= 400
        ? reply.statusCode
        : 500;
    reply.code(status);
    return reply.send({
      error: "router_error",
      code: (err as Error & { code?: string }).code ?? "internal",
      message: (err as Error).message,
    });
  });

  fastify.get("/healthz", async (_req, reply) => {
    reply.header("content-type", "application/json; charset=utf-8");
    return bigintSafe(() => ({ ok: true, time: now() }));
  });

  fastify.get("/jobs", async (_req, reply) => {
    reply.header("content-type", "application/json; charset=utf-8");
    return bigintSafe(() => store.list().map(view));
  });

  fastify.post<{ Body: unknown }>("/jobs", async (req, reply) => {
    reply.header("content-type", "application/json; charset=utf-8");
    return bigintSafe(() => app.createJob(req.body as never));
  });

  fastify.get<{ Params: { id: string } }>("/jobs/:id", async (req, reply) => {
    reply.header("content-type", "application/json; charset=utf-8");
    return bigintSafe(async () => {
      const j = await app.inspectJob(req.params.id);
      if (!j) throw new Error("job_not_found");
      return j;
    });
  });

  fastify.post<{ Params: { id: string }; Body: { approver: string } }>(
    "/jobs/:id/approve",
    async (req, reply) => {
      reply.header("content-type", "application/json; charset=utf-8");
      return bigintSafe(() => app.approveJob(req.params.id, req.body.approver));
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/jobs/:id/route",
    async (req, reply) => {
      reply.header("content-type", "application/json; charset=utf-8");
      return bigintSafe(() => app.routeJob(req.params.id));
    }
  );

  fastify.post<{ Params: { id: string } }>(
    "/jobs/:id/execute",
    async (req, reply) => {
      reply.header("content-type", "application/json; charset=utf-8");
      return bigintSafe(() => app.executeJob(req.params.id));
    }
  );

  // Reset a job back to PLANNED so a polling client can re-watch it
  // walk through every transition. The DAG and spec are preserved.
  fastify.post<{ Params: { id: string } }>(
    "/jobs/:id/reset",
    async (req, reply) => {
      reply.header("content-type", "application/json; charset=utf-8");
      return bigintSafe(() => app.resetJob(req.params.id));
    }
  );

  // Slow-motion execution. Paces the orchestrator so a polling
  // dashboard can show each state transition (PLANNED → ASSIGNED →
  // RUNNING → VERIFIED) one tick at a time. The `tickMs` body field
  // is optional and defaults to 600ms. The `scenario` field selects
  // the failure mode (defaults to "happy"). Used by the dashboard's
  // "Run demo" button.
  fastify.post<{
    Params: { id: string };
    Body: {
      tickMs?: number;
      approver?: string;
      scenario?: "happy" | "verifier" | "failure";
    };
  }>("/jobs/:id/play", async (req, reply) => {
    reply.header("content-type", "application/json; charset=utf-8");
    return bigintSafe(() =>
      app.playJob(req.params.id, {
        tickMs: req.body?.tickMs,
        approver: req.body?.approver,
        scenario: req.body?.scenario,
      })
    );
  });

  fastify.post<{ Params: { id: string } }>(
    "/jobs/:id/verify",
    async (req, reply) => {
      reply.header("content-type", "application/json; charset=utf-8");
      return bigintSafe(() => app.verifyJob(req.params.id));
    }
  );

  fastify.post<{ Params: { id: string }; Body: { reason: string } }>(
    "/jobs/:id/cancel",
    async (req, reply) => {
      reply.header("content-type", "application/json; charset=utf-8");
      return bigintSafe(() => app.cancelJob(req.params.id, req.body.reason));
    }
  );

  fastify.post<{ Params: { id: string }; Body: { taskId: string } }>(
    "/jobs/:id/retry",
    async (req, reply) => {
      reply.header("content-type", "application/json; charset=utf-8");
      return bigintSafe(() => app.retryJob(req.params.id, req.body.taskId));
    }
  );

  return fastify;
}

export async function startServer(options: ServerOptions = {}): Promise<{
  server: FastifyInstance;
  url: string;
}> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 8787;
  const server = await buildServer(options);
  await server.listen({ host, port });
  return { server, url: `http://${host}:${port}` };
}
