// Single place that knows how to connect to FalkorDB, reading from env so
// the same code works against local Docker, a bare redis-server + module,
// or FalkorDB Cloud. See .env.example for the variables.
//
// Run scripts with `node --env-file=.env <script>` (Node 20.6+) to load
// .env automatically, or export the vars yourself.

import { FalkorDB } from "falkordb";

export async function connectFalkorDB() {
  const host = process.env.FALKORDB_HOST || "127.0.0.1";
  const port = Number(process.env.FALKORDB_PORT || 6379);
  const username = process.env.FALKORDB_USERNAME || undefined;
  const password = process.env.FALKORDB_PASSWORD || undefined;

  return FalkorDB.connect({
    socket: { host, port },
    ...(username ? { username } : {}),
    ...(password ? { password } : {}),
  });
}
