# Tendril

Graph-native structural risk analysis for Solidity protocols, built on
FalkorDB for WeMakeDevs × FalkorDB **Graph Hacks** (Track 01: Agents That
Act on Connected Data, Track 02: Agent Memory and Coordination).

## What it does

Tendril parses a protocol's Solidity source into a graph (contracts,
functions, state, modifiers, token flows — see `graph/schema.md`), then an
agent traverses that graph to find and explain **structural risk paths**:
public, unguarded entry points that reach a fund-moving function, especially
through state also touched by oracle/price-reporting code.

Every finding ships with its evidence subgraph, not just a verdict — the
agent shows the exact path it followed.

**What this is not:** Tendril does not generate or execute exploit
transactions. It's a structural/static analysis tool, not an attack tool.
Findings are reported as graph evidence and a severity label for a human to
act on.

## FalkorDB's role

FalkorDB is the primary datastore and does the actual work: every finding is
the result of a Cypher path query or graph algorithm over data that only
makes sense as a graph (multi-hop call chains, shared state, role
boundaries). Remove FalkorDB and there's no product — see
`graph/cypher/02_queries.cypher` for the full query set the agent depends on.

## Setup

```bash
docker compose up -d          # starts FalkorDB (also exposes the Browser on :3000)
npm install
node ingest/ingest.js ingest/fixtures/VulnerableVault.sol tendril
node agent/agent.js ingest/fixtures/VulnerableVault.sol tendril   # full scan -> rank -> explain -> report
node tools/queries.js risk tendril                                 # or call one tool directly

# equivalent npm shortcuts (load .env automatically)
npm run scan -- ingest/fixtures/VulnerableVault.sol tendril
npm run tools -- risk tendril

cd contracts && forge test && forge coverage --report summary      # 100% coverage, no exploit code
cd ../frontend && npm install && npm run build && npm start        # evidence-path UI on :3000
```

No local Docker? Use FalkorDB Cloud instead and point `FALKORDB_HOST` /
`FALKORDB_PORT` at it (see `docs.falkordb.com`). FalkorDB also needs
**redis-server ≥ 8.0** if you ever load it as a bare Redis module instead
of via the official image — the dev sandbox this was built in only had
7.0.15 and no working Docker daemon, which is why the graph/agent code is
written and unit-verified but not yet run against a live instance; it
loaded correctly once the right redis-server version was confirmed, so it
should come up cleanly with `docker compose up -d` on a normal machine.

## Status / what's left

- [x] Graph schema (`graph/schema.md`)
- [x] Cypher query set (`graph/cypher/02_queries.cypher`)
- [x] Solidity → graph ingestion, verified against a fixture contract
- [x] Tool layer wrapping the queries (`tools/queries.js`)
- [x] Agent loop: scan → rank → explain → report (`agent/agent.js`), syntax-verified
- [x] Per-tenant memory graph for confirmed finding patterns (`agent/memory.js`, Track 02)
- [x] Foundry contracts project: deposit/withdraw/sweep + an oracle-role
      `updatePrice`/`redeemAtPrice` pair, 17 tests, 100% line/statement/
      branch/function coverage, deploy script verified against a live
      local Anvil chain (incl. `updatePrice` as a real on-chain call)
- [x] Next.js + Framer Motion evidence-path UI (`frontend/`), built and screenshot-verified
- [ ] Run the full pipeline against a live FalkorDB instance (needs Docker or redis-server 8+)
- [ ] Wire the frontend to the agent's real output instead of sample data
- [ ] Deploy
- [ ] Demo video
- [ ] Blog post

### Bugs found and fixed after initial write-up

Re-reading `ingest.js` closely surfaced two real defects, not just
polish — worth recording since they'd have made the "graph does real
work" claim false:

1. **READS/WRITES edges were never created.** The visitor meant to fill
   `facts.reads`/`facts.writes` was an empty stub, so `oracle_dependent_state`
   silently matched nothing regardless of the contract. Rewrote it as a
   two-pass walk (collect state var names, then track writes vs. reads per
   function, handling mapping access and compound assignment).
2. **`ingest.js` had no entry-point guard**, unlike `tools/queries.js` and
   `agent/agent.js` — `main()` ran unconditionally on import, which would
   break anything that ever imports `extractFacts()` as a library function
   (as the test harness that caught this does). Added the same
   `import.meta.url` check the other two files already had.

Also found mid-fix: this parser version has no separate `Assignment` AST
node — `x = y` and `x += y` are both `BinaryOperation` with an operator
field — and `emit Foo(...)` parses as a `FunctionCall`, which was
creating fake `CALLS` edges to "Function" nodes named after events.
Both are fixed and verified against the parsed AST directly.

## AI tool disclosure

Built with Claude as a coding assistant. The author (Dev Dee) designed the
graph schema and query set, wrote and reviewed the ingestion and tool code,
and can explain the architecture, data model, and every query it depends on.

## Data

Uses a fixture contract written for this project
(`ingest/fixtures/VulnerableVault.sol`) and, for the full submission,
public verified source from real deployed contracts. No private or
paywalled data.
