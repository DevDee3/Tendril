# Tendril agent loop (design)

The agent is a thin loop over the tool functions in `tools/queries.js`:

1. **Ingest** — given a contract path, run `ingest/ingest.js` to load it into
   a graph named after the protocol.
2. **Scan** — call `findRiskPaths` and `oracleDependentState`. These are the
   agent's primary tools; it doesn't write its own Cypher.
3. **Rank** — call `mostCriticalFunctions` to weight findings by how central
   the sink function is to the call graph, not just path existence.
4. **Explain** — for each finding, call `explainPath(entry, sink)` to pull
   the exact subgraph, and have the LLM turn it into a short, plain-language
   note: what the path is, why it's reachable, what state it touches.
5. **Report, not attack** — output is a ranked list of findings with their
   evidence subgraph attached (for the frontend to render) and a severity
   label. Tendril stops there: no transaction is generated or run.

This keeps the agent's "action" inside what the hackathon brief actually asks
for — act on connected data, show the path behind the answer — without
crossing into producing exploit code.

## Memory (Track 02)

Each user/protocol gets its own FalkorDB graph (`GRAPH.QUERY <name> ...`),
so findings don't leak across tenants. A second, shared graph
(`tendril_memory`) stores confirmed finding patterns as small template
subgraphs (e.g. "unguarded public function -> external call -> state write"),
so a new scan can check new paths against previously-confirmed shapes and
flag a repeat pattern faster, with a note on when it was first seen.
