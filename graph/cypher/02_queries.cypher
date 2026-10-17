// --- Tendril core queries (used as MCP tools by the agent) ---

// 1. Multi-hop paths from any public, unguarded entry point to a fund-moving sink
// name: find_risk_paths
MATCH p = (entry:Function {visibility:"public"})-[:CALLS*0..6]->(sink:Function)-[:MOVES_FUNDS]->(t:Token)
WHERE NOT (entry)-[:GUARDED_BY]->(:Modifier)-[:GRANTS]->(:Role)
RETURN p, t.symbol AS token
LIMIT 25

// 2. Functions most central to fund movement (PageRank-style call centrality)
// name: most_critical_functions
CALL algo.pageRank('Function', 'CALLS')
YIELD node, score
RETURN node.name AS function, node.contract AS contract, score
ORDER BY score DESC
LIMIT 10

// 3. Trust boundaries: clusters of functions that share state but different roles
// name: trust_boundaries
CALL algo.louvain('Function', 'READS|WRITES')
YIELD node, community
RETURN community, collect(node.name) AS functions
ORDER BY size(functions) DESC

// 4. Full evidence subgraph for one finding, for the UI to render
// name: explain_path
MATCH p = (entry:Function {name:$entry})-[:CALLS*0..6]->(sink:Function {name:$sink})
RETURN p

// 5. Oracle-dependent state: variables written by price-reporting functions
// name: oracle_dependent_state
MATCH (oracle:Function)-[:WRITES]->(v:StateVar)<-[:READS]-(consumer:Function)
WHERE oracle.name CONTAINS "price" OR oracle.name CONTAINS "Price"
RETURN oracle.name AS oracle_fn, v.name AS state_var, collect(consumer.name) AS consumers
