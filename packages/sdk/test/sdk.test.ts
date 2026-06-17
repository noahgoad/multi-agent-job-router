import { describe, expect, it } from "vitest";
import { RouterClient, RouterApiError } from "../src/client.js";

describe("sdk/client", () => {
  it("performs typed HTTP calls and parses JSON", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const c = new RouterClient({ baseUrl: "http://x", fetchImpl });
    const r = await c.createJob({} as never);
    expect(r).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("http://x/jobs");
    expect(calls[0]?.init.method).toBe("POST");
  });

  it("throws RouterApiError on non-2xx", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ message: "bad" }), { status: 400 });
    const c = new RouterClient({ baseUrl: "http://x", fetchImpl });
    await expect(c.createJob({} as never)).rejects.toBeInstanceOf(RouterApiError);
  });

  it("exposes all eight operations", () => {
    const c = new RouterClient({ baseUrl: "http://x" });
    for (const fn of [
      "createJob",
      "approveJob",
      "routeJob",
      "executeJob",
      "verifyJob",
      "cancelJob",
      "retryJob",
      "inspectJob",
    ]) {
      expect(typeof (c as unknown as Record<string, unknown>)[fn]).toBe("function");
    }
  });
});