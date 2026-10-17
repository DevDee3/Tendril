// Tendril ingest: parses Solidity source into the Tendril graph schema
// (see graph/schema.md) and loads it into FalkorDB via Cypher.
//
// This is structural analysis only: it extracts contracts, functions,
// state variables, modifiers, call edges, and read/write edges from the
// AST. It does not generate or run any transaction against the parsed
// contracts.
//
// Usage: node ingest/ingest.js <path-to-contract.sol> <graph-name>

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import parser from "@solidity-parser/parser";
import { connectFalkorDB } from "../lib/falkordb-client.js";

function esc(s) {
  return String(s).replace(/'/g, "\\'");
}

// Walks an expression node to find the state-variable identifier it
// ultimately refers to: `balances[msg.sender]` (IndexAccess) -> "balances",
// `price` (Identifier) -> "price", `self.x` (MemberAccess) -> "x"'s base.
function rootIdentifierName(node) {
  while (node) {
    if (node.type === "Identifier") return node.name;
    if (node.type === "IndexAccess") {
      node = node.base;
      continue;
    }
    if (node.type === "MemberAccess") {
      node = node.expression;
      continue;
    }
    break;
  }
  return null;
}

export function extractFacts(sourceCode, fileName) {
  const ast = parser.parse(sourceCode, { loc: true });
  const facts = { contracts: [], functions: [], stateVars: [], modifiers: [], calls: [], externalCalls: [], reads: [], writes: [], guards: [], moves: [] };

  // pass 1: contracts, state vars, modifiers — need the full set of state
  // var names before walking function bodies, regardless of where in the
  // source they're declared relative to the functions that use them
  parser.visit(ast, {
    ContractDefinition(node) {
      facts.contracts.push({ name: node.name, file: fileName, kind: node.kind });
    },
    StateVariableDeclaration(node) {
      for (const v of node.variables) {
        facts.stateVars.push({ name: v.name, type: v.typeName ? v.typeName.name || v.typeName.type : "unknown" });
      }
    },
    ModifierDefinition(node) {
      facts.modifiers.push({ name: node.name });
    },
  });

  const stateVarNames = new Set(facts.stateVars.map((v) => v.name));

  // pass 2: functions, including which state vars each one reads/writes
  parser.visit(ast, {
    FunctionDefinition(node) {
      const fnName = node.name || (node.isConstructor ? "constructor" : "fallback");
      facts.functions.push({
        name: fnName,
        visibility: node.visibility || "default",
        stateMutability: node.stateMutability || "nonpayable",
        selector: fnName,
      });

      for (const m of node.modifiers || []) {
        facts.guards.push({ fn: fnName, modifier: m.name });
      }

      if (!node.body) return;

      // Identifier nodes that are the target of a plain `=` assignment are
      // writes, not reads — track them by node identity so the read-scan
      // below doesn't double-count them.
      const writeTargetNodes = new Set();
      // In this parser version, `x = y`, `x += y`, etc. are ALL
      // BinaryOperation nodes (there's no separate Assignment type) —
      // distinguished only by `operator`. Only these operators are writes;
      // everything else (`==`, `>=`, `&&`, ...) is a plain read/comparison.
      const assignOps = new Set(["=", "+=", "-=", "*=", "/=", "%=", "|=", "&=", "^=", "<<=", ">>="]);

      function handleWrite(targetExpr, operator) {
        const targetName = rootIdentifierName(targetExpr);
        if (targetName && stateVarNames.has(targetName)) {
          facts.writes.push({ fn: fnName, stateVar: targetName });
          // a compound assignment reads the current value too
          if (operator !== "=") {
            facts.reads.push({ fn: fnName, stateVar: targetName });
          }
        }
        parser.visit(targetExpr, {
          Identifier(idNode) {
            writeTargetNodes.add(idNode);
          },
        });
      }

      parser.visit(node.body, {
        BinaryOperation(binNode) {
          if (assignOps.has(binNode.operator)) {
            handleWrite(binNode.left, binNode.operator);
          }
        },
      });

      // `emit Foo(...)` parses as EmitStatement wrapping a FunctionCall —
      // track that inner node by identity so it isn't also recorded as a
      // CALLS edge to a fake "Function" node named after the event.
      const emitCallNodes = new Set();
      parser.visit(node.body, {
        EmitStatement(emitNode) {
          if (emitNode.eventCall) emitCallNodes.add(emitNode.eventCall);
        },
      });

      parser.visit(node.body, {
        Identifier(idNode) {
          if (stateVarNames.has(idNode.name) && !writeTargetNodes.has(idNode)) {
            facts.reads.push({ fn: fnName, stateVar: idNode.name });
          }
        },
        FunctionCall(callNode) {
          if (emitCallNodes.has(callNode)) return;
          const expr = callNode.expression;
          if (expr && expr.type === "Identifier" && !new Set(["require", "assert", "revert", "address", "payable"]).has(expr.name)) {
            facts.calls.push({ from: fnName, to: expr.name });
          } else if (expr && (expr.type === "MemberAccess" || expr.type === "NameValueExpression")) {
            const member = expr.type === "NameValueExpression" ? expr.expression : expr;
            if (!member || member.type !== "MemberAccess") return;
            const target = member.memberName;
            facts.externalCalls.push({ from: fnName, target });
            if (/transfer|send|call|mint|burn/i.test(target)) {
              facts.moves.push({ fn: fnName, token: target });
            }
          }
        },
      });
    },
  });

  return facts;
}

async function load(falkor, graphName, facts) {
  const g = falkor.selectGraph(graphName);

  // Each ingest is a snapshot. Clear the old snapshot so removed source
  // nodes cannot create phantom findings on later scans.
  await g.query("MATCH (n) DETACH DELETE n");

  for (const c of facts.contracts) {
    await g.query(`MERGE (:Contract {name:'${esc(c.name)}', file:'${esc(c.file)}'})`);
  }
  for (const f of facts.functions) {
    await g.query(
      `MERGE (:Function {name:'${esc(f.name)}', visibility:'${esc(f.visibility)}', mutability:'${esc(f.stateMutability)}', selector:'${esc(f.selector)}'})`
    );
  }
  for (const v of facts.stateVars) {
    await g.query(`MERGE (:StateVar {name:'${esc(v.name)}', type:'${esc(v.type)}'})`);
  }
  for (const m of facts.modifiers) {
    await g.query(`MERGE (:Modifier {name:'${esc(m.name)}'})`);
  }
  for (const c of facts.calls) {
    await g.query(
      `MATCH (a:Function {name:'${esc(c.from)}'}) MERGE (b:Function {name:'${esc(c.to)}'}) MERGE (a)-[:CALLS]->(b)`
    );
  }
  for (const c of facts.externalCalls) {
    await g.query(
      `MATCH (f:Function {name:'${esc(c.from)}'}) MERGE (x:ExternalCall {target:'${esc(c.target)}'}) MERGE (f)-[:CALLS_EXTERNAL]->(x)`
    );
  }
  for (const guard of facts.guards) {
    await g.query(
      `MATCH (f:Function {name:'${esc(guard.fn)}'}) MERGE (m:Modifier {name:'${esc(guard.modifier)}'}) MERGE (f)-[:GUARDED_BY]->(m)`
    );
  }
  for (const r of facts.reads) {
    await g.query(
      `MATCH (f:Function {name:'${esc(r.fn)}'}) MERGE (v:StateVar {name:'${esc(r.stateVar)}'}) MERGE (f)-[:READS]->(v)`
    );
  }
  for (const w of facts.writes) {
    await g.query(
      `MATCH (f:Function {name:'${esc(w.fn)}'}) MERGE (v:StateVar {name:'${esc(w.stateVar)}'}) MERGE (f)-[:WRITES]->(v)`
    );
  }
  for (const mv of facts.moves) {
    await g.query(
      `MATCH (f:Function {name:'${esc(mv.fn)}'}) MERGE (t:Token {symbol:'${esc(mv.token)}'}) MERGE (f)-[:MOVES_FUNDS]->(t)`
    );
  }
}

export async function ingestSource(source, fileName, graphName = "tendril") {
  const facts = extractFacts(source, fileName);
  const falkor = await connectFalkorDB();
  try {
    await load(falkor, graphName, facts);
  } finally {
    await falkor.close();
  }
  return facts;
}

async function main() {
  const [, , srcPath, graphName = "tendril"] = process.argv;
  if (!srcPath) {
    console.error("usage: node ingest/ingest.js <contract.sol> [graphName]");
    process.exit(1);
  }
  const source = fs.readFileSync(srcPath, "utf8");
  const facts = extractFacts(source, path.basename(srcPath));
  if (!process.env.TENDRIL_QUIET) {
    console.error(
      `Parsed ${facts.contracts.length} contracts, ${facts.functions.length} functions, ` +
      `${facts.calls.length} internal calls, ${facts.externalCalls.length} external calls, ` +
      `${facts.reads.length} reads, ${facts.writes.length} writes, ${facts.moves.length} fund-moving edges.`
    );
  }

  await ingestSource(source, path.basename(srcPath), graphName);
  if (!process.env.TENDRIL_QUIET) console.error(`Loaded into FalkorDB graph "${graphName}".`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
