// Seeds the running API server with a representative multi-agent
// job so the dashboard has something to render.
//
// The job is a 3-task DAG (fetch -> analyze -> summarize) with a
// single trusted agent that exercises every UI panel:
//   - DAG view
//   - States (VERIFIED / FAILED / PLANNED mix)
//   - Assignments table
//   - Partner data (CertiK + heartbeat freshness + confidence)
//   - Receipt (chain id, four roots, explorer link)
//
// Usage: `node scripts/seed-demo.mjs` (assumes the API is already
// listening on the URL in $API_URL or http://127.0.0.1:8787).

const BASE = process.env.API_URL ?? "http://127.0.0.1:8787";
const TOKEN = process.env.API_TOKEN ?? "dev-token";
const CHAIN_ID = 688689;

const auth = {
  authorization: `Bearer ${TOKEN}`,
  "content-type": "application/json",
};

const bigintReplacer = (_k, v) =>
  typeof v === "bigint" ? `${v.toString()}n` : v;

function hash(s) {
  // FNV-1a 32-bit hash, hex-prefixed and zero-padded to 32 bytes.
  // The dashboard only renders the first 10 chars, so the exact
  // value is cosmetic; deterministic is all that matters here.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return ("0x" + hex).padEnd(66, "0");
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: auth,
    body: body !== undefined ? JSON.stringify(body, bigintReplacer) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return text ? JSON.parse(text) : undefined;
}

const spec = {
  jobId: "demo",
  goal: "Demo: route a 4-task diamond DAG, verify it, and inspect the receipt",
  goalHash: hash("goal:demo"),
  budgetMicrousd: 1_000_000n,
  deadline: 9_999_999_999,
  allowedCapabilities: ["fetch", "analyze", "summarize", "verify", "financial"],
  policyHash: hash("policy:demo"),
  verifier: "verifier-default",
  tasks: [
    {
      taskId: "t1",
      description: "Fetch the source document",
      dependencies: [],
      capability: "fetch",
      inputHash: hash("t1:demo"),
      budgetMicrousd: 100_000n,
      deadline: 9_000_000_000,
      verifier: "verifier-default",
      verifierKind: "hash",
    },
    {
      taskId: "t2",
      description: "Analyze the fetched content",
      dependencies: ["t1"],
      capability: "analyze",
      inputHash: hash("t2:demo"),
      budgetMicrousd: 200_000n,
      deadline: 9_400_000_000,
      verifier: "verifier-default",
      verifierKind: "deterministic",
    },
    {
      taskId: "t3",
      description: "Validate the analysis",
      dependencies: ["t1"],
      capability: "verify",
      inputHash: hash("t3:demo"),
      budgetMicrousd: 200_000n,
      deadline: 9_600_000_000,
      verifier: "verifier-default",
      verifierKind: "schema",
    },
    {
      taskId: "t4",
      description: "Finalize the report",
      dependencies: ["t2", "t3"],
      capability: "summarize",
      inputHash: hash("t4:demo"),
      budgetMicrousd: 300_000n,
      deadline: 9_900_000_000,
      verifier: "verifier-default",
      verifierKind: "schema",
    },
  ],
};

console.log("=== Seeding demo job ===");
console.log("API base          :", BASE);
console.log("jobId             :", spec.jobId);
console.log("");

console.log("[1/3] POST /jobs ...");
const created = await call("POST", "/jobs", spec);
console.log(
  "      -> state keys:",
  Object.keys(created?.state ?? {}).join(", ")
);

console.log("[2/3] POST /jobs/:id/approve ...");
await call("POST", "/jobs/demo/approve", { approver: "demo-operator" });
console.log("      -> ok");

// Note: we deliberately skip `/jobs/:id/execute` here. Running it now
// would walk the orchestrator to completion in milliseconds and persist
// the terminal state to jobs.json before the dashboard has a chance to
// render the PLANNED DAG. The dashboard's auto-play handler kicks in
// on first load and replays the transitions with the user-chosen
// tickMs, which is what makes the demo legible.
console.log("[3/3] (skipped) POST /jobs/:id/execute -> dashboard will auto-play on load");
console.log("");

console.log("Demo job ready (PLANNED). Open the dashboard at:");
console.log(
  `  ${BASE.replace(
    /:\d+$/,
    `:${process.env.WEB_PORT ?? 5173}`
  )}/?jobId=demo&authToken=dev-token`
);
console.log("");
console.log("Or, if the dashboard is served with the default props, it will");
console.log("render the same job at the dashboard root URL.");
