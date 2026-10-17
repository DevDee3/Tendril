"use client";

import { motion } from "framer-motion";
import type { Finding, NodeKind } from "@/lib/findings";

const kindColor: Record<NodeKind, string> = {
  Function: "#8aaea8",
  StateVar: "#8294a8",
  Modifier: "#9a8ea6",
  Token: "#ad9a74",
  Contract: "#8995a3",
};

// Simple deterministic layout: nodes placed left-to-right in the order
// they appear, since Tendril's findings are short paths (1-6 hops).
function layout(nodes: Finding["nodes"]) {
  const width = 640;
  const height = 220;
  if (nodes.length === 3) {
    return nodes.map((n, i) => ({
      ...n,
      x: [320, 105, 535][i],
      y: [30, 158, 158][i],
    }));
  }
  const margin = 80;
  const step = nodes.length > 1 ? (width - margin * 2) / (nodes.length - 1) : 0;
  return nodes.map((n, i) => ({
    ...n,
    x: margin + step * i,
    y: height / 2 + (i % 2 === 0 ? -30 : 30),
  }));
}

export default function EvidenceGraph({ finding }: { finding: Finding }) {
  const placed = layout(finding.nodes);
  const byId = Object.fromEntries(placed.map((n) => [n.id, n]));
  const trianglePath = placed.length === 3
    ? `M ${placed[0].x} ${placed[0].y} L ${placed[1].x} ${placed[1].y} L ${placed[2].x} ${placed[2].y} Z`
    : null;

  // offset the label (and curve slightly) when multiple edges share the
  // same pair of nodes, so e.g. READS and WRITES between the same two
  // nodes don't draw their labels on top of each other
  const pairCounts: Record<string, number> = {};
  const pairTotals: Record<string, number> = {};
  for (const edge of finding.edges) {
    const key = [edge.from, edge.to].sort().join("|");
    pairTotals[key] = (pairTotals[key] ?? 0) + 1;
  }

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-[var(--border)] bg-[linear-gradient(135deg,rgba(18,27,40,0.9),rgba(8,12,18,0.92))] p-2 sm:rounded-2xl sm:p-5" role="img" aria-label={`Evidence path for ${finding.entry} to ${finding.sink}`}>
      <svg viewBox="0 0 640 220" preserveAspectRatio="xMidYMid meet" className="h-[190px] w-full sm:h-[220px]">
        <defs>
          <linearGradient id="flow-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#789b96" />
            <stop offset="50%" stopColor="#71858f" />
            <stop offset="100%" stopColor="#a08f6f" />
          </linearGradient>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker id="edge-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 z" fill="#64748b" />
          </marker>
          <marker id="fund-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 z" fill="#ad7d84" />
          </marker>
          <marker id="flow-arrow" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M0,0 L9,4.5 L0,9 z" fill="#829e98" />
          </marker>
        </defs>
        {trianglePath && (
          <g aria-label="Animated evidence flow">
            <motion.path
              d={trianglePath}
              fill="none"
              stroke="url(#flow-gradient)"
              strokeOpacity={0.18}
              strokeWidth={10}
              strokeLinejoin="round"
              filter="url(#soft-glow)"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
            <path d={trianglePath} fill="none" stroke="url(#flow-gradient)" strokeOpacity={0.68} strokeWidth={1.5} strokeDasharray="4 8" markerEnd="url(#flow-arrow)" />
            <polygon points="0,-5 11,0 0,5" fill="#c1cfca" filter="url(#soft-glow)">
              <animateMotion dur="4.8s" repeatCount="indefinite" rotate="auto" path={trianglePath} />
            </polygon>
          </g>
        )}
        {finding.edges.map((e, i) => {
          const a = byId[e.from];
          const b = byId[e.to];
          if (!a || !b) return null;
          const dash = e.type === "GUARDED_BY" ? "4 4" : undefined;
          const color = e.type === "MOVES_FUNDS" ? "#ad7d84" : "#526270";

          const pairKey = [e.from, e.to].sort().join("|");
          const occurrence = pairCounts[pairKey] ?? 0;
          pairCounts[pairKey] = occurrence + 1;
          const total = pairTotals[pairKey] ?? 1;
          const separation = (occurrence - (total - 1) / 2) * 22;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const distance = Math.max(1, Math.sqrt(dx * dx + dy * dy));
          const normalX = -dy / distance;
          const normalY = dx / distance;
          const midX = (a.x + b.x) / 2;
          const midY = (a.y + b.y) / 2;
          const controlX = midX + normalX * separation;
          const controlY = midY + normalY * separation;
          const labelX = (a.x + 2 * controlX + b.x) / 4;
          const labelY = (a.y + 2 * controlY + b.y) / 4;
          const edgePath = `M ${a.x} ${a.y} Q ${controlX} ${controlY} ${b.x} ${b.y}`;
          const labelWidth = Math.max(52, e.type.length * 6.2 + 14);

          return (
            <g key={`${e.from}-${e.to}-${i}`}>
              <motion.path
                d={edgePath}
                stroke={color}
                strokeWidth={2}
                strokeDasharray={dash}
                markerEnd={`url(#${e.type === "MOVES_FUNDS" ? "fund-arrow" : "edge-arrow"})`}
                fill="none"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.15 * i, ease: "easeInOut" }}
              />
              <motion.rect
                x={labelX - labelWidth / 2}
                y={labelY - 17}
                width={labelWidth}
                height={14}
                fill="#0b111b"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 * i + 0.3 }}
              />
              <motion.text
                x={labelX}
                y={labelY - 6}
                fontSize={10}
                textAnchor="middle"
                fill="#8b93a7"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 * i + 0.3 }}
                className="mono"
              >
                {e.type}
              </motion.text>
            </g>
          );
        })}

        {placed.map((n, i) => (
          <motion.g
            key={n.id}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.1 * i, type: "spring", stiffness: 260, damping: 18 }}
          >
            {(n.kind === "StateVar" || n.kind === "Token") && (
              <motion.g
                initial={{ opacity: 0, rotate: 0 }}
                animate={{ opacity: 1, rotate: 360 }}
                transition={{
                  opacity: { duration: 0.4, delay: 0.2 + i * 0.1 },
                  rotate: { duration: 7, delay: 0.5, repeat: Infinity, ease: "linear" },
                }}
                style={{ originX: `${n.x}px`, originY: `${n.y}px` }}
              >
                <circle cx={n.x} cy={n.y} r={32} fill="none" stroke={kindColor[n.kind]} strokeOpacity={0.22} strokeWidth={1} strokeDasharray="2 7" />
                <circle cx={n.x + 32} cy={n.y} r={2.5} fill={kindColor[n.kind]} />
              </motion.g>
            )}
            <circle cx={n.x} cy={n.y} r={n.kind === "Function" ? 24 : 25} fill="#0b111b" stroke={kindColor[n.kind]} strokeWidth={2} filter="url(#soft-glow)" />
            <circle cx={n.x} cy={n.y} r={n.kind === "Function" ? 19 : 20} fill="none" stroke={kindColor[n.kind]} strokeOpacity={0.16} strokeWidth={1} />
            <rect x={n.x - Math.max(28, n.label.length * 3.5 + 8)} y={n.y + 30} width={Math.max(56, n.label.length * 7 + 16)} height={19} rx={9.5} fill="#0b111b" stroke="#263246" strokeOpacity={0.8} />
            <text x={n.x} y={n.y + 43} fontSize={11} textAnchor="middle" fill="var(--text)" className="mono">
              {n.label.replace(/\(\)$/, "")}
            </text>
            <text x={n.x} y={n.y + 4} fontSize={9} textAnchor="middle" fill={kindColor[n.kind]}>
              {n.kind.slice(0, 1)}
            </text>
          </motion.g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[var(--text-dim)]" aria-hidden="true">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#8aaea8]" />function</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#8294a8]" />state</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-[#ad7d84]" />fund movement</span>
        <span>··· guarded path</span>
      </div>
    </div>
  );
}
