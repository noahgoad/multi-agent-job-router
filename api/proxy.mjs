const API_BASE = "https://pharos-router-api-jrst.onrender.com";

function requestedPath(req) {
  const value = new URL(req.url ?? "/", "http://localhost").searchParams.get(
    "path"
  );
  if (!value) return null;

  const segments = value.split("/");
  const isAllowedRoot = segments[0] === "jobs" || value === "healthz";
  const hasUnsafeSegment = segments.some(
    (segment) => !segment || segment === "." || segment === ".."
  );
  if (!isAllowedRoot || hasUnsafeSegment) return null;

  return segments.map(encodeURIComponent).join("/");
}

function requestBody(req) {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  if (typeof req.body === "string" || Buffer.isBuffer(req.body)) {
    return req.body;
  }
  return JSON.stringify(req.body ?? {});
}

export default async function handler(req, res) {
  const path = requestedPath(req);
  if (!path) {
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "invalid_proxy_path" }));
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("allow", "GET, POST");
    res.end();
    return;
  }

  const headers = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (typeof req.headers?.authorization === "string") {
    headers.authorization = req.headers.authorization;
  }

  try {
    const upstream = await fetch(`${API_BASE}/${path}`, {
      method: req.method,
      headers,
      body: requestBody(req),
    });
    const body = Buffer.from(await upstream.arrayBuffer());

    res.statusCode = upstream.status;
    res.setHeader(
      "content-type",
      upstream.headers.get("content-type") ?? "application/json"
    );
    res.setHeader("cache-control", "no-store");
    res.end(body);
  } catch {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "api_upstream_unavailable" }));
  }
}
