# Running Tendril locally

You'll need Docker Desktop. The browser is the normal Tendril interface; Docker only runs the API and graph database behind it.

## One-command setup

On Windows PowerShell:

```powershell
.\setup.ps1
```

On macOS/Linux:

```bash
bash setup.sh
```

The setup creates `.env`, generates a secure API token, builds all images,
waits for FalkorDB and the API to become ready, and starts the complete stack.
Then open http://localhost:3001 and use the upload/paste analysis flow.

To stop the stack:

```bash
docker compose down
```

To start it again later without rebuilding:

```bash
docker compose up -d
```

The remaining sections below are for contributors and operators.

```bash
# 1. configure the API token, then start the full stack
cp .env.example .env
# Set TENDRIL_API_TOKEN in .env to a long random secret before production use.
docker compose up --build -d
# FalkorDB Browser at http://localhost:3000 if you want to look at the graph directly
# Tendril UI at http://localhost:3001; the compose stack also starts the API

# Load the included demo contract into the graph
docker compose run --rm tendril-api node ingest/ingest.js ingest/fixtures/VulnerableVault.sol tendril

# 2. env file (defaults already match step 1 — only edit if you're
#    pointing at FalkorDB Cloud or a non-default host/port)
cp .env.example .env

# 3. install JS deps (root: ingestion/agent/tools; frontend: separate)
npm install
cd frontend && npm install && cd ..

# 4. run the agent end to end — ingests the fixture contract, scans it,
#    ranks findings, pulls the evidence subgraph, writes to the memory
#    graph, and prints the report as JSON
node --env-file=.env agent/agent.js ingest/fixtures/VulnerableVault.sol tendril

# 5. or call one tool directly instead of the full pipeline
node --env-file=.env tools/queries.js risk tendril

# 6. contracts: tests + coverage (should be 17 passing, 100% on VulnerableVault.sol)
cd contracts
cp .env.example .env   # only needed for the deploy script, step 7
forge test
forge coverage --report summary
cd ..

# 7. deploy the fixture and see it on-chain — local anvil by default
anvil &                 # in this terminal or a separate one
cd contracts
forge script script/Deploy.s.sol \
  --rpc-url http://127.0.0.1:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast
# that private key is anvil's well-known test account #0 — test funds
# only, printed by anvil itself on startup, never use it anywhere real
cd ..

# 7b. or deploy to Sepolia instead — see contracts/.env.example for the
# full command. IMPORTANT: first remove the `solc`/`offline` lines from
# contracts/foundry.toml (see the note at the bottom of this file) —
# those exist only for this sandboxed dev environment and offline mode
# may block the RPC calls a real deploy needs.

# 8. frontend (currently renders sample data in src/lib/findings.ts —
#    swap that for the real output of step 4 once you've got findings)
cd frontend
npm run build && npm start
# open http://localhost:3000
```

If `forge build` complains about fetching solc, it's trying to reach
`binaries.soliditylang.org`; that's only an issue in network-restricted
sandboxes. On a normal machine with internet access, delete the
`solc = "/usr/local/bin/solc"` and `offline = true` lines from
`contracts/foundry.toml` and Foundry will fetch solc itself as usual.
