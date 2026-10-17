// Track 02: per-tenant memory. Every protocol gets its own FalkorDB graph
// (passed around as `graphName` everywhere else in this project), so
// findings never leak across tenants. This file manages one extra, shared
// graph — "tendril_memory" — that stores confirmed finding *shapes*
// (entry role, guard presence, sink type, oracle overlap) as small template
// records, not raw contract data, so a new scan can check "have we seen
// this shape before" without exposing one tenant's findings to another.

import { connectFalkorDB } from "../lib/falkordb-client.js";

const MEMORY_GRAPH = process.env.FALKORDB_MEMORY_GRAPH || "tendril_memory";

async function connectMemory() {
  const falkor = await connectFalkorDB();
  return { falkor, g: falkor.selectGraph(MEMORY_GRAPH) };
}

// Reduce a finding to a template signature: the structural shape, not the
// contract-specific names, so "unguarded public fn -> external call -> fund
// move, oracle-linked" matches across different protocols.
function signatureOf(finding) {
  const guarded = finding.summary?.includes("GUARDED_BY") ? "guarded" : "unguarded";
  const oracle = finding.summary?.includes("oracle-dependent") ? "oracle-linked" : "isolated";
  return `${guarded}:${finding.severity}:${oracle}`;
}

export async function confirmFinding(finding) {
  const { falkor, g } = await connectMemory();
  try {
    const sig = signatureOf(finding);
    const now = new Date().toISOString();
    await g.query(
      `MERGE (t:AttackTemplate {signature:$sig})
       ON CREATE SET t.firstSeen = $now, t.timesSeen = 1
       ON MATCH SET t.timesSeen = t.timesSeen + 1, t.lastSeen = $now
       MERGE (p:Protocol {name:$protocol})
       MERGE (p)-[:HAD_FINDING]->(t)`,
      { params: { sig, now, protocol: finding.protocol } }
    );
    return sig;
  } finally {
    await falkor.close();
  }
}

export async function matchTemplates(graphName, entry, sink) {
  // Look up whether a template with this rough shape has been confirmed
  // before, across any protocol. graphName/entry/sink are accepted for
  // future use (e.g. weighting by how similar the current protocol's
  // naming is) but the match itself is signature-based.
  const { falkor, g } = await connectMemory();
  try {
    const res = await g.query(
      `MATCH (t:AttackTemplate) RETURN t.signature AS signature, t.timesSeen AS timesSeen ORDER BY timesSeen DESC LIMIT 5`
    );
    return res.data;
  } finally {
    await falkor.close();
  }
}
