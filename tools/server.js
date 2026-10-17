import http from "node:http";
import { createClient } from "redis";
import { findRiskPaths, graphReady, mostCriticalFunctions, oracleDependentState } from "./queries.js";
import { scanSource } from "../agent/agent.js";
import { confirmFinding } from "../agent/memory.js";

const port = Number(process.env.TENDRIL_API_PORT || 8787);
const defaultGraph = process.env.TENDRIL_GRAPH || "tendril";
const apiToken = process.env.TENDRIL_API_TOKEN || "";
const apiTokens = new Set([apiToken, ...(process.env.TENDRIL_API_TOKENS || "").split(",")].map((token) => token.trim()).filter(Boolean));
const allowedOrigins = new Set((process.env.TENDRIL_ALLOWED_ORIGINS || "http://localhost:3001,http://localhost:3000").split(",").map((origin) => origin.trim()).filter(Boolean));
const requestLog = new Map();
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = 60;
const rateLimitRedisUrl = process.env.TENDRIL_RATE_LIMIT_REDIS_URL || "";
const rateRedis = rateLimitRedisUrl ? createClient({ url: rateLimitRedisUrl }) : null;

if (process.env.NODE_ENV === "production" && apiTokens.size === 0) {
  throw new Error("TENDRIL_API_TOKEN must be configured in production");
}

function json(res, status, body, origin) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...(origin && allowedOrigins.has(origin) ? { "access-control-allow-origin": origin, "vary": "Origin" } : {}),
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(body));
}

function clientKey(req) {
  return req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

function allowed(req) {
  if (apiTokens.size === 0) return process.env.NODE_ENV !== "production";
  const header = req.headers.authorization || "";
  return apiTokens.has(header.replace(/^Bearer\s+/i, ""));
}

async function rateLimited(req) {
  const now = Date.now();
  if (requestLog.size > 10_000) {
    for (const [key, entry] of requestLog) {
      if (now - entry.startedAt >= RATE_WINDOW_MS) requestLog.delete(key);
    }
  }
  const key = clientKey(req);
  if (rateRedis?.isReady) {
    try {
      const count = await rateRedis.incr(`tendril:rate:${key}`);
      if (count === 1) await rateRedis.expire(`tendril:rate:${key}`, 60);
      return count > RATE_LIMIT;
    } catch (error) {
      console.error("shared rate limiter unavailable", error);
      if (process.env.NODE_ENV === "production") return true;
    }
  }
  const current = requestLog.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    requestLog.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT;
}

function validGraphName(name) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(name);
}

async function readJson(req, maxBytes = 1_500_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("request too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function severityFor(hasOracleOverlap, centrality) {
  if (hasOracleOverlap) return "critical";
  if (centrality > 2) return "high";
  return "medium";
}

function toFinding(row, criticalMap, oracleRows, graphName, index) {
  const oracleLinked = oracleRows.some(
    (oracle) => oracle.consumers?.includes(row.entry) || oracle.consumers?.includes(row.sink)
  );
  const centrality = criticalMap.get(row.sink) ?? 0;
  const nodes = [
    { id: `entry-${index}`, label: `${row.entry}()`, kind: "Function" },
  ];
  const edges = [];
  if (row.entry !== row.sink) {
    nodes.push({ id: `sink-${index}`, label: `${row.sink}()`, kind: "Function" });
    edges.push({ from: `entry-${index}`, to: `sink-${index}`, type: "CALLS" });
  }
  nodes.push({ id: `token-${index}`, label: row.token, kind: "Token" });
  edges.push({
    from: row.entry === row.sink ? `entry-${index}` : `sink-${index}`,
    to: `token-${index}`,
    type: "MOVES_FUNDS",
  });

  return {
    id: `${graphName}:${row.entry}->${row.sink}:${row.token}`,
    protocol: graphName,
    entry: row.entry,
    sink: row.sink,
    token: row.token,
    severity: severityFor(oracleLinked, centrality),
    summary: `${row.entry}() reaches ${row.sink}(), which moves ${row.token}. ${oracleLinked ? "The path also touches state written by an oracle or price-reporting function." : "No oracle-dependent state was found on this path."}`,
    nodes,
    edges,
  };
}

async function findings(graphName) {
  const [riskRows, criticalRows, oracleRows] = await Promise.all([
    findRiskPaths(graphName),
    mostCriticalFunctions(graphName),
    oracleDependentState(graphName),
  ]);
  const criticalMap = new Map(criticalRows.map((row) => [row.function, row.inbound_calls]));
  return riskRows.map((row, index) => toFinding(row, criticalMap, oracleRows, graphName, index));
}

async function findingsWithRetry(graphName) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await findings(graphName);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw lastError;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const origin = req.headers.origin;
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...(origin && allowedOrigins.has(origin) ? { "access-control-allow-origin": origin, "vary": "Origin" } : {}),
      "access-control-allow-headers": "Authorization, Content-Type",
      "access-control-allow-methods": "GET,POST,OPTIONS",
    });
    return res.end();
  }
  if (url.pathname === "/health") return json(res, 200, { ok: true, service: "tendril-api" }, origin);
  if (url.pathname === "/ready") {
    try {
      const ready = await graphReady(defaultGraph);
      return json(res, ready ? 200 : 503, { ok: ready, graph: defaultGraph }, origin);
    } catch {
      return json(res, 503, { ok: false, graph: defaultGraph }, origin);
    }
  }
  if (url.pathname !== "/api/findings" && url.pathname !== "/api/scan") return json(res, 404, { error: "not found" }, origin);
  if (req.method !== "GET" && !(req.method === "POST" && url.pathname === "/api/scan")) return json(res, 405, { error: "method not allowed" }, origin);
  if (!allowed(req)) return json(res, 401, { error: "unauthorized" }, origin);
  if (await rateLimited(req)) return json(res, 429, { error: "rate limit exceeded" }, origin);

  const graphName = url.searchParams.get("graph") || defaultGraph;
  if (!validGraphName(graphName)) return json(res, 400, { error: "invalid graph name" }, origin);
  if (url.pathname === "/api/scan") {
    try {
      const body = await readJson(req);
      const source = typeof body.source === "string" ? body.source : "";
      const fileName = typeof body.fileName === "string" ? body.fileName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "contract.sol" : "contract.sol";
      if (!source.trim()) return json(res, 400, { error: "Solidity source is required" }, origin);
      if (source.length > 1_000_000) return json(res, 413, { error: "contract is too large" }, origin);
      const scanFindings = await scanSource(source, fileName, graphName);
      for (const finding of scanFindings) await confirmFinding(finding);
      // Return the same graph-shaped contract used by the dashboard's live refresh.
      return json(res, 200, { graph: graphName, findings: await findingsWithRetry(graphName) }, origin);
    } catch (error) {
      console.error(error);
      return json(res, 422, { error: "unable to analyze contract" }, origin);
    }
  }
  try {
    return json(res, 200, { graph: graphName, findings: await findingsWithRetry(graphName) }, origin);
  } catch (error) {
    console.error(error);
    return json(res, 503, { error: "analysis service unavailable" }, origin);
  }
});

async function start() {
  if (rateRedis) {
    await rateRedis.connect();
    rateRedis.on("error", (error) => console.error("rate limiter redis error", error));
  }
  server.listen(port, "0.0.0.0", () => {
    console.log(`Tendril API listening on http://0.0.0.0:${port}`);
  });
}

start().catch((error) => {
  console.error("unable to start Tendril API", error);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`${signal} received; shutting down`);
  server.close(async () => {
    if (rateRedis?.isOpen) await rateRedis.quit();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
