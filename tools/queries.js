// Tendril tool layer: wraps the Cypher in graph/cypher/02_queries.cypher as
// plain async functions. An agent framework (LangChain, a hand-rolled loop,
// or an MCP server) calls these as tools — pick one based on what the final
// agent runtime needs; this file is the implementation either way.

import { connectFalkorDB } from "../lib/falkordb-client.js";
import { pathToFileURL } from "node:url";

async function connect(graphName = "tendril") {
  const falkor = await connectFalkorDB();
  return { falkor, g: falkor.selectGraph(graphName) };
}

async function queryGraph(graphName, cypher, params) {
  const { falkor, g } = await connect(graphName);
  try {
    return await g.query(cypher, params);
  } finally {
    await falkor.close();
  }
}

export async function graphReady(graphName = "tendril") {
  const res = await queryGraph(graphName, "RETURN 1 AS ok");
  return res.data?.[0]?.ok === 1;
}

export async function findRiskPaths(graphName) {
  const res = await queryGraph(graphName, `
    MATCH p = (entry:Function {visibility:"public"})-[:CALLS*0..6]->(sink:Function)-[:MOVES_FUNDS]->(t:Token)
    WHERE NOT (entry)-[:GUARDED_BY]->(:Modifier)
    RETURN entry.name AS entry, sink.name AS sink, t.symbol AS token
    LIMIT 25
  `);
  return res.data;
}

export async function mostCriticalFunctions(graphName) {
  // fallback if algo.pageRank isn't available on the running FalkorDB build:
  const res = await queryGraph(graphName, `
    MATCH (f:Function)<-[:CALLS]-(caller)
    RETURN f.name AS function, count(caller) AS inbound_calls
    ORDER BY inbound_calls DESC
    LIMIT 10
  `);
  return res.data;
}

export async function explainPath(graphName, entry, sink) {
  const res = await queryGraph(graphName,
    `MATCH p = (e:Function {name:$entry})-[:CALLS*0..6]->(s:Function {name:$sink}) RETURN p`,
    { params: { entry, sink } }
  );
  return res.data;
}

export async function oracleDependentState(graphName) {
  const res = await queryGraph(graphName, `
    MATCH (oracle:Function)-[:WRITES]->(v:StateVar)<-[:READS]-(consumer:Function)
    WHERE oracle.name CONTAINS "price" OR oracle.name CONTAINS "Price"
    RETURN oracle.name AS oracle_fn, v.name AS state_var, collect(consumer.name) AS consumers
  `);
  return res.data;
}

// quick CLI smoke test: node tools/queries.js risk tendril
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , cmd, graphName] = process.argv;
  const fns = { risk: findRiskPaths, critical: mostCriticalFunctions, oracle: oracleDependentState };
  const fn = fns[cmd];
  if (!fn) {
    console.error("usage: node tools/queries.js <risk|critical|oracle> [graphName]");
    process.exit(1);
  }
  fn(graphName)
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(`query failed: ${err.message}`);
      process.exitCode = 1;
    });
}
