// Run once per graph (FalkorDB supports per-tenant graphs via GRAPH.QUERY <graph-name>)
CREATE INDEX FOR (f:Function) ON (f.selector)
CREATE INDEX FOR (c:Contract) ON (c.name)
