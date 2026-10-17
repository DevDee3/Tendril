"use client";

import { motion } from "framer-motion";
import type { Finding } from "@/lib/findings";

const severityStyle: Record<Finding["severity"], string> = {
  critical: "bg-[color:var(--critical)]/10 text-[color:var(--critical)] border-[color:var(--critical)]/35",
  high: "bg-[color:var(--high)]/10 text-[color:var(--high)] border-[color:var(--high)]/35",
  medium: "bg-[color:var(--medium)]/10 text-[color:var(--medium)] border-[color:var(--medium)]/35",
};

export default function FindingCard({ finding, active, onSelect, index }: { finding: Finding; active: boolean; onSelect: () => void; index: number }) {
  return (
    <motion.button
      layout
      type="button"
      aria-pressed={active}
      aria-label={`${finding.severity} finding: ${finding.entry} reaches ${finding.sink}`}
      onClick={onSelect}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08, duration: 0.35 }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.985 }}
      className={`w-full rounded-2xl border p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.1)] transition-all duration-200 ${active ? "border-[var(--accent)]/60 bg-[var(--accent-dim)] shadow-[0_0_0_1px_rgba(145,170,165,0.08),0_12px_30px_rgba(0,0,0,0.18)]" : "border-[var(--border)] bg-[var(--panel)] hover:-translate-y-0.5 hover:border-[var(--accent)]/30 hover:bg-[var(--panel-raised)]"}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-dim)]">risk path</span>
        <span className={`rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${severityStyle[finding.severity]}`}>{finding.severity}</span>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <span className="mono text-[var(--text)]">{finding.entry}</span>
        <span className="text-xs text-[var(--text-dim)]">→</span>
        <span className="mono text-[var(--text)]">{finding.sink}</span>
      </div>
      <p className="mt-3 line-clamp-3 text-xs leading-5 text-[var(--text-dim)]">{finding.summary}</p>
      <div className="mono mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-[10px] uppercase tracking-[0.1em] text-[var(--text-dim)]">
        <span>{finding.token}</span>
        <span>{finding.edges.length} edges</span>
      </div>
    </motion.button>
  );
}
