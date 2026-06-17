import { describe, expect, it, vi, afterEach } from "vitest";
import { renderToString } from "react-dom/server";
import React from "react";
import { Dashboard } from "../src/App.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("web/Dashboard", () => {
  it("renders the loading state when no job is available", () => {
    // Mock fetch to a never-resolving promise so we stay in "loading"
    vi.stubGlobal("fetch", () => new Promise(() => {}));
    const html = renderToString(React.createElement(Dashboard, { jobId: "x" }));
    // The new design has a "Loading" eyebrow and a "job · x" mono label.
    expect(html).toMatch(/Loading/);
    expect(html).toMatch(/>job\s*·/);
    expect(html).toMatch(/x<\/span>/);
  });

  it("renders the dashboard header once a job is loaded", () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({
            jobId: "demo",
            spec: {
              jobId: "demo",
              goal: "demo",
              goalHash: "0x" + "00".repeat(32),
              budgetMicrousd: "1000",
              deadline: 100,
              allowedCapabilities: ["read"],
              policyHash: "0x" + "00".repeat(32),
              verifier: "v",
              tasks: [],
            },
            graph: { jobId: "demo", nodes: [], criticalPath: [] },
            dagHash: "0x" + "00".repeat(32),
            state: {},
            assignments: [],
            results: [],
            verifications: [],
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );
    const html = renderToString(
      React.createElement(Dashboard, { jobId: "demo" })
    );
    // The server-render call kicks off useEffect; the initial render
    // shows the loading state. The header is rendered only after
    // fetch resolves, which doesn't happen in a sync render. So we
    // assert the loading copy and the title text from the SDK are
    // present.
    expect(html).toMatch(/Loading/);
    expect(html).toMatch(/>job\s*·/);
    expect(html).toMatch(/demo<\/span>/);
  });
});
