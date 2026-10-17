#!/usr/bin/env node
// Wraps solc-js (installed from npm) so it behaves like a `solc` binary that
// Foundry can call with `--standard-json`: reads standard-JSON input on
// stdin, writes standard-JSON output on stdout. Used only because this
// sandbox can't reach binaries.soliditylang.org to fetch a native solc.
const path = require("node:path");
const solc = require(path.join(__dirname, "..", "node_modules", "solc"));

if (process.argv.includes("--version")) {
  // Foundry parses this output expecting real solc's format.
  console.log("solc, the solidity compiler commandline interface");
  console.log(`Version: ${solc.version()}`);
  process.exit(0);
}

let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  const output = solc.compile(input);
  process.stdout.write(output);
});
