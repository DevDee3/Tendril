import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFacts } from "../ingest/ingest.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = fs.readFileSync(path.join(root, "ingest", "fixtures", "VulnerableVault.sol"), "utf8");

test("extractFacts captures the fixture's structural risk signals", () => {
  const facts = extractFacts(fixture, "VulnerableVault.sol");

  assert.equal(facts.contracts.length, 1);
  assert.equal(facts.functions.length, 6);
  assert.ok(facts.functions.some((fn) => fn.name === "withdraw" && fn.visibility === "external"));
  assert.ok(facts.calls.some((call) => call.from === "withdraw" && call.to === "require") === false);
  assert.ok(facts.externalCalls.some((call) => call.from === "withdraw" && call.target === "call"));
  assert.ok(facts.writes.some((write) => write.fn === "updatePrice" && write.stateVar === "price"));
  assert.ok(facts.reads.some((read) => read.fn === "redeemAtPrice" && read.stateVar === "price"));
  assert.ok(facts.guards.some((guard) => guard.fn === "sweep" && guard.modifier === "onlyOwner"));
  assert.ok(facts.moves.some((move) => move.fn === "withdraw" && move.token === "call"));
});

test("extractFacts does not execute the CLI when imported", () => {
  assert.equal(typeof extractFacts, "function");
});
