# Tendril graph schema

Tendril models a Solidity protocol as a graph so an agent can trace *how*
privilege and value move through it, instead of reading functions one at a time.

## Nodes

| Label        | Key properties                              |
|--------------|----------------------------------------------|
| Contract     | name, file, address? (if deployed)            |
| Function     | name, contract, visibility, mutability, selector |
| StateVar     | name, contract, type                           |
| Role         | name (e.g. owner, admin, onlyX modifier)       |
| Modifier     | name, contract                                 |
| ExternalCall | target (contract.function or interface call)   |
| Token        | symbol, address?                               |

## Relationships

| Type              | From -> To                  | Meaning                              |
|-------------------|------------------------------|---------------------------------------|
| CALLS             | Function -> Function          | internal/external call                |
| CALLS_EXTERNAL    | Function -> ExternalCall       | call leaving the contract (low-level call, interface call) |
| READS             | Function -> StateVar           | function reads a state variable       |
| WRITES            | Function -> StateVar           | function writes a state variable      |
| GUARDED_BY        | Function -> Modifier           | function carries a modifier           |
| GRANTS            | Modifier -> Role               | modifier enforces a role check        |
| HOLDS             | Contract -> Token              | contract custodies a token/balance    |
| MOVES_FUNDS       | Function -> Token              | function transfers/mints/burns a token |
| CALLABLE_BY       | Role -> Function                | which role can reach a function (derived) |

## Derived risk signal (no exploit code, structure only)

A **risk path** is any path:

```
(entry:Function {visibility:"public"})-[:CALLS*0..6]->(sink:Function)-[:MOVES_FUNDS]->(:Token)
```
where `entry` has no `GUARDED_BY` edge to a privileged `Modifier`, and the path
crosses a `StateVar` that is also read by a pricing/oracle-dependent function.

Tendril surfaces these paths with their full subgraph as "evidence" and a
plain-language description. It does not generate or execute a transaction
sequence against them — the output is an audit finding, not a working attack.
