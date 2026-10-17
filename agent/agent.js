// Tendril agent: the scan -> rank -> explain -> report loop described in
// agent/agent.md, wired to the real tool functions in tools/queries.js.
//
// This produces structured findings (a list of {entry, sink, token,
// severity, summary, nodes, edges}) in the same shape the frontend
// (frontend/src/lib/findings.ts) renders. It does not generate or run any
// transaction against the scanned contracts.
//
// Usage: node agent/agent.js <contract.sol> [graphName]

import path from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  findRiskPaths,
  mostCriticalFunctions,
  oracleDependentState,
  explainPath,
} from "../tools/queries.js";
import { matchTemplates, confirmFinding } from "./memory.js";
import { ingestSource } from "../ingest/ingest.js";

function severityFor({ hasOracleOverlap, centrality }) {
  if (hasOracleOverlap) return "critical";
  if (centrality > 2) return "high";
  return "medium";
}

function summarize(finding, criticalMap, oracleRows) {
  const touchesOracle = oracleRows.some(
    (r) => r.consumers?.includes(finding.entry) || r.consumers?.includes(finding.sink)
  );
  const centrality = criticalMap.get(finding.sink) ?? 0;
  const bits = [
    `${finding.entry}() reaches ${finding.sink}(), which moves ${finding.token}.`,
    touchesOracle
      ? "That path also touches state written by an oracle/price-reporting function."
      : "No oracle-dependent state on this path.",
    `${finding.sink}() has ${centrality} inbound call edge(s) in the graph.`,
  ];
  return bits.join(" ");
}

async function analyzeGraph(graphName = "tendril") {
  // Scan the graph after ingestion. The same function is used by the CLI and web API.
  const [riskPaths, oracleRows] = await Promise.all([
    findRiskPaths(graphName),
    oracleDependentState(graphName),
  ]);

  // 3. rank
  const criticalRows = await mostCriticalFunctions(graphName);
  const criticalMap = new Map(criticalRows.map((r) => [r.function, r.inbound_calls]));

  // 4. explain + memory match, one finding per risk path
  const findings = [];
  for (const rp of riskPaths) {
    const [subgraph, templateMatches] = await Promise.all([
      explainPath(graphName, rp.entry, rp.sink),
      matchTemplates(graphName, rp.entry, rp.sink),
    ]);

    const touchesOracle = oracleRows.some(
      (r) => r.consumers?.includes(rp.entry) || r.consumers?.includes(rp.sink)
    );
    const centrality = criticalMap.get(rp.sink) ?? 0;

    findings.push({
      id: `${graphName}:${rp.entry}->${rp.sink}`,
      protocol: graphName,
      entry: rp.entry,
      sink: rp.sink,
      token: rp.token,
      severity: severityFor({ hasOracleOverlap: touchesOracle, centrality }),
      summary: summarize(rp, criticalMap, oracleRows),
      matchedTemplates: templateMatches,
      subgraph,
    });
  }

  // 5. report, not attack: findings are returned/printed, nothing executed
  return findings;
}

export async function scanSource(source, fileName = "contract.sol", graphName = "tendril") {
  await ingestSource(source, fileName, graphName);
  return analyzeGraph(graphName);
}

export async function scan(contractPath, graphName = "tendril") {
  const ingestScript = path.resolve(import.meta.dirname, "../ingest/ingest.js");
  execFileSync("node", [ingestScript, contractPath, graphName], {
    stdio: "inherit",
    env: { ...process.env, TENDRIL_QUIET: "1" },
  });
  return analyzeGraph(graphName);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , contractPath, graphName] = process.argv;
  if (!contractPath) {
    console.error("usage: node agent/agent.js <contract.sol> [graphName]");
    process.exit(1);
  }
  scan(contractPath, graphName)
    .then(async (findings) => {
      console.log(JSON.stringify(findings, null, 2));
      // confirmed findings feed back into the shared memory graph so a
      // later scan on a different protocol can match the same shape faster
      for (const f of findings) {
        await confirmFinding(f);
      }
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
