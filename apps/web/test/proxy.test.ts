import { describe, expect, it, vi } from "vitest";

// The Vercel function is JavaScript so it can deploy without joining the
// monorepo TypeScript project graph.
// @ts-expect-error No declaration file is needed for the deployment handler.
import handler from "../../../api/proxy.mjs";

function responseMock() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
    },
    end(body: unknown) {
      this.body = body;
    },
  };
}

describe("Vercel API proxy", () => {
  it("forwards authenticated writes without the browser Origin header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ jobId: "demo" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const req = {
      method: "POST",
      url: "/api/proxy?path=jobs/demo/play",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        origin: "https://pharos-router-web.vercel.app",
      },
      body: { tickMs: 1500, scenario: "happy" },
    };
    const res = responseMock();

    await handler(req, res);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(
      "https://pharos-router-api-jrst.onrender.com/jobs/demo/play"
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        authorization: "Bearer dev-token",
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({ tickMs: 1500, scenario: "happy" }),
    });
    expect(init.headers).not.toHaveProperty("origin");
    expect(res.statusCode).toBe(200);
  });
});
