import { describe, expect, it } from "vitest";
import {
  contentHash,
  hashString,
  type Hash,
  type JobSpec,
} from "@pharos-router/workflow";
import { buildServer } from "../src/server.js";
import { AgentSkillRegistry } from "@pharos-router/registry";
import { ArtifactStore } from "@pharos-router/workflow";

const TOKEN = "test-token";

function authHeader(): { authorization: string } {
  return { authorization: `Bearer ${TOKEN}` };
}

function hash(s: string): Hash {
  return hashString(s);
}

function bigintReplacer(_k: string, v: unknown): unknown {
  return typeof v === "bigint" ? `${v.toString()}n` : v;
}

/**
 * Encodes a value as a JSON body and a matching content-type
 * header for use with `server.inject`. BigInts are encoded with
 * a trailing `n` so the server-side parser can revive them.
 */
function jsonBody(value: unknown): {
  payload: string;
  headers: Record<string, string>;
} {
  return {
    payload: JSON.stringify(value, bigintReplacer),
    headers: { "content-type": "application/json" },
  };
}

function job(extra: Partial<JobSpec> = {}): JobSpec {
  return {
    jobId: "job-x",
    goal: "demo",
    goalHash: hash("goal"),
    budgetMicrousd: 1_000_000n,
    deadline: 9_999_999_999,
    allowedCapabilities: [
      "fetch",
      "analyze",
      "summarize",
      "verify",
      "financial",
    ],
    policyHash: hash("policy"),
    verifier: "verifier-default",
    tasks: [
      {
        taskId: "t1",
        description: "fetch",
        dependencies: [],
        capability: "fetch",
        inputHash: hash("t1"),
        budgetMicrousd: 100_000n,
        deadline: 9_000_000_000,
        verifier: "verifier-default",
        verifierKind: "hash",
      },
      {
        taskId: "t2",
        description: "analyze",
        dependencies: ["t1"],
        capability: "analyze",
        inputHash: hash("t2"),
        budgetMicrousd: 200_000n,
        deadline: 9_400_000_000,
        verifier: "verifier-default",
        verifierKind: "deterministic",
      },
      {
        taskId: "t3",
        description: "validate",
        dependencies: ["t1"],
        capability: "verify",
        inputHash: hash("t3"),
        budgetMicrousd: 200_000n,
        deadline: 9_600_000_000,
        verifier: "verifier-default",
        verifierKind: "schema",
      },
      {
        taskId: "t4",
        description: "summarize",
        dependencies: ["t2", "t3"],
        capability: "summarize",
        inputHash: hash("t4"),
        budgetMicrousd: 300_000n,
        deadline: 9_900_000_000,
        verifier: "verifier-default",
        verifierKind: "schema",
      },
    ],
    ...extra,
  };
}

function postJSON(
  url: string,
  value: unknown,
  extraHeaders: Record<string, string> = {}
): {
  method: "POST";
  url: string;
  payload: string;
  headers: Record<string, string>;
} {
  const jb = jsonBody(value);
  return {
    method: "POST",
    url,
    payload: jb.payload,
    headers: { ...jb.headers, ...extraHeaders },
  };
}

describe("api/server", () => {
  /**
   * Build a registry with a single healthy skill + agent so the
   * scenario tests don't have to repeat ~40 lines of boilerplate.
   * Defined at the top of the `describe` body so it's visible to
   * every `it` below (function declarations inside an `it` block
   * would be block-scoped in strict mode and unreachable from
   * sibling `it`s).
   */
  function makeReadyServer() {
    const registry = new AgentSkillRegistry();
    const sk = {
      skillId: "fetch",
      version: "1.0.0",
      releaseHash: ("0x" + "00".repeat(32)) as Hash,
      imageDigest: "sha256:abc",
      publishedAt: 0,
      expiresAt: 9_999_999_999,
      capabilities: ["fetch", "analyze", "verify", "summarize"],
      certikVerdict: "pass" as const,
      certikVerdictAt: 0,
      certikReportUrl: "https://certik.example/1",
    };
    {
      const { releaseHash: _omit, ...body } = sk;
      sk.releaseHash = contentHash(body);
    }
    registry.registerSkill(sk);
    registry.registerAgent({
      agentId: "agent-1",
      displayName: "A1",
      endpoint: "https://a1.example",
      pricingMicrousd: 1_000n,
      trustScore: 90,
      capabilities: ["fetch", "analyze", "verify", "summarize"],
      activeSkillRelease: sk.releaseHash,
      lastHeartbeat: 100,
      registeredAt: 0,
    });
    registry.recordHeartbeat({
      agentId: "agent-1",
      endpoint: "https://a1.example",
      issuedAt: 100,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    return { registry, sk };
  }

  it("requires a bearer token on /jobs/*", async () => {
    const server = await buildServer({ security: { authToken: TOKEN } });
    const r = await server.inject(postJSON("/jobs", job()));
    expect(r.statusCode).toBe(401);
  });

  it("rejects an invalid bearer token", async () => {
    const server = await buildServer({ security: { authToken: TOKEN } });
    const r = await server.inject(
      postJSON("/jobs", job(), { authorization: "Bearer wrong" })
    );
    expect(r.statusCode).toBe(401);
  });

  it("rejects an unknown CORS origin on writes", async () => {
    const server = await buildServer({
      security: { authToken: TOKEN, corsOrigins: ["http://allowed.example"] },
    });
    const r = await server.inject(
      postJSON("/jobs", job(), {
        ...authHeader(),
        origin: "http://evil.example",
      })
    );
    expect(r.statusCode).toBe(403);
  });

  it("answers CORS preflight (OPTIONS) from an allowed origin", async () => {
    const server = await buildServer({
      security: { authToken: TOKEN, corsOrigins: ["http://allowed.example"] },
    });
    const r = await server.inject({
      method: "OPTIONS",
      url: "/jobs/job-x",
      headers: {
        origin: "http://allowed.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    // Preflight must be 2xx (browsers reject anything else as
    // "Response to preflight request doesn't pass access control
    // check", which manifests to the user as "Failed to fetch").
    expect(r.statusCode).toBe(204);
    expect(r.headers["access-control-allow-origin"]).toBe(
      "http://allowed.example"
    );
    expect(r.headers["access-control-allow-credentials"]).toBe("true");
    expect(r.headers["access-control-allow-methods"]).toMatch(/GET/);
    expect(r.headers["access-control-allow-headers"]).toMatch(/authorization/);
  });

  it("rejects a CORS preflight from a non-allowed origin", async () => {
    const server = await buildServer({
      security: { authToken: TOKEN, corsOrigins: ["http://allowed.example"] },
    });
    const r = await server.inject({
      method: "OPTIONS",
      url: "/jobs/job-x",
      headers: {
        origin: "http://evil.example",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization,content-type",
      },
    });
    // A non-allowed origin must NOT get an `access-control-allow-origin`
    // header echoed back, otherwise the browser would let the real
    // request through.
    expect(r.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("enforces body-size limit", async () => {
    const server = await buildServer({
      security: { authToken: TOKEN, bodyLimitBytes: 128 },
    });
    const big = "x".repeat(1024);
    const r = await server.inject(
      postJSON(
        "/jobs",
        { jobId: "job-big", goal: big, goalHash: hash("g"), ...job() },
        authHeader()
      )
    );
    expect(r.statusCode).toBe(413);
  });

  it("creates, approves, and executes a job end-to-end", async () => {
    const registry = new AgentSkillRegistry();
    const sk = {
      skillId: "summarize",
      version: "1.0.0",
      releaseHash: ("0x" + "00".repeat(32)) as Hash,
      imageDigest: "sha256:abc",
      publishedAt: 0,
      expiresAt: 9_999_999_999,
      capabilities: ["fetch", "analyze", "verify", "summarize"],
      certikVerdict: "pass" as const,
      certikVerdictAt: 0,
      certikReportUrl: "https://certik.example/1",
    };
    {
      const { releaseHash: _omit, ...body } = sk;
      sk.releaseHash = contentHash(body);
    }
    registry.registerSkill(sk);
    registry.registerAgent({
      agentId: "agent-1",
      displayName: "A1",
      endpoint: "https://a1.example",
      pricingMicrousd: 1_000n,
      trustScore: 90,
      capabilities: ["fetch", "analyze", "verify", "summarize"],
      activeSkillRelease: sk.releaseHash,
      lastHeartbeat: 0,
      registeredAt: 0,
    });
    registry.recordHeartbeat({
      agentId: "agent-1",
      endpoint: "https://a1.example",
      issuedAt: 0,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    const server = await buildServer({
      security: { authToken: TOKEN },
      deps: { registry, artifact: new ArtifactStore() },
    });
    const create = await server.inject(postJSON("/jobs", job(), authHeader()));
    expect(create.statusCode).toBe(200);
    const approve = await server.inject(
      postJSON("/jobs/job-x/approve", { approver: "alice" }, authHeader())
    );
    expect(approve.statusCode).toBe(200);
    const exec = await server.inject({
      method: "POST",
      url: "/jobs/job-x/execute",
      headers: authHeader(),
    });
    expect(exec.statusCode).toBe(200);
    const body = exec.json();
    expect(body.receipt.dagHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(body.receipt.chainId).toBe(688689);
  });

  it("rejects execute without approval", async () => {
    const server = await buildServer({ security: { authToken: TOKEN } });
    await server.inject(postJSON("/jobs", job(), authHeader()));
    const exec = await server.inject({
      method: "POST",
      url: "/jobs/job-x/execute",
      headers: authHeader(),
    });
    expect(exec.statusCode).toBe(500);
  });

  it("cancels a job and inspects it", async () => {
    const server = await buildServer({ security: { authToken: TOKEN } });
    await server.inject(postJSON("/jobs", job(), authHeader()));
    const cancel = await server.inject(
      postJSON("/jobs/job-x/cancel", { reason: "user" }, authHeader())
    );
    expect(cancel.statusCode).toBe(200);
    const insp = await server.inject({
      method: "GET",
      url: "/jobs/job-x",
      headers: authHeader(),
    });
    expect(insp.json().state.t1).toBe("CANCELLED");
  });

  it("returns 200 health without auth", async () => {
    const server = await buildServer({ security: { authToken: TOKEN } });
    const r = await server.inject({ method: "GET", url: "/healthz" });
    expect(r.statusCode).toBe(200);
  });

  it("rate-limits excessive writes", async () => {
    const server = await buildServer({
      security: { authToken: TOKEN, rateLimitPerMinute: 2 },
    });
    let last = 0;
    for (let i = 0; i < 4; i++) {
      const r = await server.inject(
        postJSON("/jobs", { ...job(), jobId: `job-${i}` }, authHeader())
      );
      last = r.statusCode;
    }
    expect(last).toBe(429);
  });

  it("resets a job back to PLANNED with cleared artefacts", async () => {
    const registry = new AgentSkillRegistry();
    const sk = {
      skillId: "fetch",
      version: "1.0.0",
      releaseHash: ("0x" + "00".repeat(32)) as Hash,
      imageDigest: "sha256:abc",
      publishedAt: 0,
      expiresAt: 9_999_999_999,
      capabilities: ["fetch", "analyze", "verify", "summarize"],
      certikVerdict: "pass" as const,
      certikVerdictAt: 0,
      certikReportUrl: "https://certik.example/1",
    };
    {
      const { releaseHash: _omit, ...body } = sk;
      sk.releaseHash = contentHash(body);
    }
    registry.registerSkill(sk);
    registry.registerAgent({
      agentId: "agent-1",
      displayName: "A1",
      endpoint: "https://a1.example",
      pricingMicrousd: 1_000n,
      trustScore: 90,
      capabilities: ["fetch", "analyze", "verify", "summarize"],
      activeSkillRelease: sk.releaseHash,
      lastHeartbeat: 100,
      registeredAt: 0,
    });
    registry.recordHeartbeat({
      agentId: "agent-1",
      endpoint: "https://a1.example",
      issuedAt: 100,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    // Pin `now` close to the heartbeat so the registry considers the
    // agent fresh (default `now` is wall-clock time, which makes the
    // heartbeat look 50 years stale).
    const server = await buildServer({
      security: { authToken: TOKEN },
      deps: {
        registry,
        artifact: new ArtifactStore(),
        now: () => 200,
      },
    });
    await server.inject(postJSON("/jobs", job(), authHeader()));
    await server.inject(
      postJSON("/jobs/job-x/approve", { approver: "alice" }, authHeader())
    );
    await server.inject({
      method: "POST",
      url: "/jobs/job-x/execute",
      headers: authHeader(),
    });
    // After execute: VERIFIED + receipt.
    let insp = await server.inject({
      method: "GET",
      url: "/jobs/job-x",
      headers: authHeader(),
    });
    expect(insp.json().state.t1).toBe("VERIFIED");
    expect(insp.json().receipt).toBeDefined();

    // After reset: PLANNED + no receipt.
    const reset = await server.inject({
      method: "POST",
      url: "/jobs/job-x/reset",
      headers: authHeader(),
    });
    expect(reset.statusCode).toBe(200);
    insp = await server.inject({
      method: "GET",
      url: "/jobs/job-x",
      headers: authHeader(),
    });
    expect(insp.json().state.t1).toBe("PLANNED");
    expect(insp.json().state.t2).toBe("PLANNED");
    expect(insp.json().receipt).toBeUndefined();
    expect(insp.json().assignments).toEqual([]);
    expect(insp.json().results).toEqual([]);
  });

  it("playJob auto-approves, runs, and walks every transition", async () => {
    const registry = new AgentSkillRegistry();
    const sk = {
      skillId: "fetch",
      version: "1.0.0",
      releaseHash: ("0x" + "00".repeat(32)) as Hash,
      imageDigest: "sha256:abc",
      publishedAt: 0,
      expiresAt: 9_999_999_999,
      capabilities: ["fetch", "analyze", "verify", "summarize"],
      certikVerdict: "pass" as const,
      certikVerdictAt: 0,
      certikReportUrl: "https://certik.example/1",
    };
    {
      const { releaseHash: _omit, ...body } = sk;
      sk.releaseHash = contentHash(body);
    }
    registry.registerSkill(sk);
    registry.registerAgent({
      agentId: "agent-1",
      displayName: "A1",
      endpoint: "https://a1.example",
      pricingMicrousd: 1_000n,
      trustScore: 90,
      capabilities: ["fetch", "analyze", "verify", "summarize"],
      activeSkillRelease: sk.releaseHash,
      lastHeartbeat: 100,
      registeredAt: 0,
    });
    registry.recordHeartbeat({
      agentId: "agent-1",
      endpoint: "https://a1.example",
      issuedAt: 100,
      nonce: "abcd1234",
      signature: hash("sig"),
    });
    const server = await buildServer({
      security: { authToken: TOKEN },
      deps: {
        registry,
        artifact: new ArtifactStore(),
        now: () => 200,
      },
    });
    await server.inject(postJSON("/jobs", job(), authHeader()));
    // No explicit approve — playJob should auto-approve.
    const play = await server.inject({
      method: "POST",
      url: "/jobs/job-x/play",
      payload: jsonBody({ tickMs: 5 }).payload,
      headers: { ...authHeader(), "content-type": "application/json" },
    });
    expect(play.statusCode).toBe(200);
    const body = play.json();
    // Both tasks must end VERIFIED, and the receipt must be sealed.
    expect(body.state.t1).toBe("VERIFIED");
    expect(body.state.t2).toBe("VERIFIED");
    expect(body.receipt).toBeDefined();
    expect(body.receipt.chainId).toBe(688689);
  });

  it("playJob 'verifier' scenario: t1+t3 OK, t2 verifier fails, t4 cancels", async () => {
    const { registry } = makeReadyServer();
    const server = await buildServer({
      security: { authToken: TOKEN },
      deps: { registry, artifact: new ArtifactStore(), now: () => 200 },
    });
    await server.inject(postJSON("/jobs", job(), authHeader()));
    const play = await server.inject({
      method: "POST",
      url: "/jobs/job-x/play",
      payload: jsonBody({ tickMs: 5, scenario: "verifier" }).payload,
      headers: { ...authHeader(), "content-type": "application/json" },
    });
    expect(play.statusCode).toBe(200);
    const body = play.json();
    // t1 succeeds (correct outputHash).
    expect(body.state.t1).toBe("VERIFIED");
    // t2's outputHash doesn't match → verifier disagrees → FAILED.
    expect(body.state.t2).toBe("FAILED");
    // t3 is parallel to t2 with deps [t1] only — it should run
    // to completion despite t2's failure.
    expect(body.state.t3).toBe("VERIFIED");
    // t4 depends on BOTH t2 and t3; t2's failure must cancel it.
    expect(body.state.t4).toBe("CANCELLED");
  });

  it("playJob 'failure' scenario: t1 worker throws, t2/t3/t4 cancel", async () => {
    const { registry } = makeReadyServer();
    const server = await buildServer({
      security: { authToken: TOKEN },
      deps: { registry, artifact: new ArtifactStore(), now: () => 200 },
    });
    await server.inject(postJSON("/jobs", job(), authHeader()));
    const play = await server.inject({
      method: "POST",
      url: "/jobs/job-x/play",
      payload: jsonBody({ tickMs: 5, scenario: "failure" }).payload,
      headers: { ...authHeader(), "content-type": "application/json" },
    });
    expect(play.statusCode).toBe(200);
    const body = play.json();
    // t1 worker throws 3 times → FAILED.
    expect(body.state.t1).toBe("FAILED");
    // Cascading cancellation: every transitive downstream of t1
    // is CANCELLED (t2, t3, t4).
    expect(body.state.t2).toBe("CANCELLED");
    expect(body.state.t3).toBe("CANCELLED");
    expect(body.state.t4).toBe("CANCELLED");
  });
});
