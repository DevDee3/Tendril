// Shape mirrors what tools/queries.js returns from FalkorDB (findRiskPaths +
// explainPath). This file is sample data so the UI is demoable without a
// live DB connection; swap `getFindings()` for a fetch to a small API route
// that calls the real tool functions once FalkorDB is running.

export type NodeKind = "Function" | "StateVar" | "Modifier" | "Token" | "Contract";

export interface GraphNode {
  id: string;
  label: string;
  kind: NodeKind;
}

export interface GraphEdge {
  from: string;
  to: string;
  type: "CALLS" | "READS" | "WRITES" | "MOVES_FUNDS" | "GUARDED_BY";
}

export interface Finding {
  id: string;
  protocol: string;
  entry: string;
  sink: string;
  token: string;
  severity: "critical" | "high" | "medium";
  summary: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export const findings: Finding[] = [
  {
    id: "f1",
    protocol: "VulnerableVault",
    entry: "withdraw",
    sink: "withdraw",
    token: "ETH",
    severity: "critical",
    summary:
      "withdraw() is public with no role guard, calls out to msg.sender before balances[msg.sender] is decremented, and moves ETH directly. The graph shows no GUARDED_BY edge on the path.",
    nodes: [
      { id: "withdraw", label: "withdraw()", kind: "Function" },
      { id: "balances", label: "balance", kind: "StateVar" },
      { id: "eth", label: "ETH", kind: "Token" },
    ],
    edges: [
      { from: "withdraw", to: "balances", type: "READS" },
      { from: "withdraw", to: "eth", type: "MOVES_FUNDS" },
      { from: "withdraw", to: "balances", type: "WRITES" },
    ],
  },
  {
    id: "f2",
    protocol: "VulnerableVault",
    entry: "sweep",
    sink: "sweep",
    token: "ETH",
    severity: "medium",
    summary:
      "sweep() moves the full contract balance but is correctly GUARDED_BY onlyOwner → Role(owner). Flagged only because it's a fund-moving sink worth keeping in the picture.",
    nodes: [
      { id: "sweep", label: "sweep()", kind: "Function" },
      { id: "onlyOwner", label: "onlyOwner", kind: "Modifier" },
      { id: "eth2", label: "ETH", kind: "Token" },
    ],
    edges: [
      { from: "sweep", to: "onlyOwner", type: "GUARDED_BY" },
      { from: "sweep", to: "eth2", type: "MOVES_FUNDS" },
    ],
  },
];

export function getFindings(): Finding[] {
  return findings.map((finding) => ({
    ...finding,
    nodes: [...finding.nodes],
    edges: [...finding.edges],
  }));
}
