"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import type { Finding } from "@/lib/findings";
import FindingCard from "@/components/FindingCard";
import EvidenceGraph from "@/components/EvidenceGraph";

type SeverityFilter = "all" | Finding["severity"];
const severityOrder: Record<Finding["severity"], number> = { critical: 0, high: 1, medium: 2 };

export default function Dashboard({ findings }: { findings: Finding[] }) {
  const [activeFindings, setActiveFindings] = useState(findings);
  const [selectedId, setSelectedId] = useState(findings[0]?.id);
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [copied, setCopied] = useState(false);
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState("contract.sol");
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [scanMessage, setScanMessage] = useState("");

  const visibleFindings = useMemo(() => {
    const search = query.trim().toLowerCase();
    return activeFindings
      .filter((finding) => severity === "all" || finding.severity === severity)
      .filter((finding) => !search || [finding.protocol, finding.entry, finding.sink, finding.token, finding.summary].join(" ").toLowerCase().includes(search))
      .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }, [activeFindings, query, severity]);

  const selected = visibleFindings.find((finding) => finding.id === selectedId) ?? visibleFindings[0];
  const count = (level: SeverityFilter) => level === "all" ? activeFindings.length : activeFindings.filter((finding) => finding.severity === level).length;

  async function runScan() {
    if (!source.trim() || scanning) return;
    setScanning(true);
    setScanError("");
    setScanMessage("");
    try {
      const response = await fetch("/api/scan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ source, fileName }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Analysis failed");
      const nextFindings = Array.isArray(payload.findings) ? payload.findings : [];
      setActiveFindings(nextFindings);
      setSelectedId(nextFindings[0]?.id);
      setScanMessage(nextFindings.length ? `Analysis complete · ${nextFindings.length} finding${nextFindings.length === 1 ? "" : "s"} traced` : "Analysis complete · no risk paths found");
    } catch (error) {
      setScanError(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setScanning(false);
    }
  }

  async function readContract(file: File) {
    setFileName(file.name);
    setSource(await file.text());
    setScanError("");
  }

  async function copyFinding() {
    if (!selected || !navigator.clipboard) return;
    await navigator.clipboard.writeText(JSON.stringify(selected, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <MotionConfig reducedMotion="user">
    <main className="grain-bg min-h-screen px-4 py-6 sm:px-6 sm:py-10 md:px-12">
      <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mx-auto mb-8 flex w-full max-w-7xl flex-col gap-5 border-b border-[var(--border)] pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mono mb-2 text-[10px] uppercase tracking-[0.22em] text-[var(--accent)]">Security graph / findings</p>
          <h1 className="text-2xl font-semibold tracking-tight">Tendril</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--text-dim)]">Structural risk findings traced through the FalkorDB graph — evidence behind the answer, not an exploit.</p>
        </div>
        <span className="mono flex w-fit items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-[10px] uppercase tracking-[0.14em] text-[var(--text-dim)] shadow-[0_8px_30px_rgba(0,0,0,0.18)]"><i className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />connected · tendril</span>
      </motion.header>

      <section aria-label="Analyze a contract" className="mx-auto mb-8 w-full max-w-7xl rounded-3xl border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_18px_55px_rgba(0,0,0,0.16)] sm:p-6">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.18em] text-[var(--accent)]">Start an analysis</p>
            <h2 className="mt-1 text-lg font-medium">Bring your contract into the graph</h2>
          </div>
          <p className="text-xs text-[var(--text-dim)]">Structural analysis only · no transactions are executed</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <textarea value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste Solidity source here, or choose a .sol file…" spellCheck={false} className="min-h-28 w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--bg-soft)] px-4 py-3 font-mono text-xs leading-6 text-[var(--text)] outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/60" />
          <div className="flex flex-col gap-3 lg:min-w-44">
            <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] px-4 text-center text-xs text-[var(--text-dim)] transition-colors hover:border-[var(--accent)]/60 hover:text-[var(--text)]">
              <input type="file" accept=".sol,text/plain" className="sr-only" onChange={(event) => event.target.files?.[0] && readContract(event.target.files[0])} />
              {source ? fileName : "Choose .sol file"}
            </label>
            <button type="button" disabled={!source.trim() || scanning} onClick={runScan} className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-[#0a1012] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-45">{scanning ? "Tracing contract…" : "Analyze contract"}</button>
          </div>
        </div>
        {scanError && <p role="alert" className="mt-3 text-xs text-[var(--critical)]">{scanError}</p>}
        {scanMessage && !scanError && <p role="status" className="mt-3 text-xs text-[var(--accent)]">{scanMessage}</p>}
      </section>

      <section aria-label="Finding summary" className="mx-auto mb-6 grid w-full max-w-7xl grid-cols-2 gap-2 sm:mb-8 sm:grid-cols-4 sm:gap-3">
        {(["all", "critical", "high", "medium"] as const).map((level, index) => (
          <motion.button type="button" key={level} onClick={() => setSeverity(level)} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.06, duration: 0.3 }} whileHover={{ y: -3 }} whileTap={{ scale: 0.98 }} className={`group min-h-[76px] rounded-xl border p-3 text-left shadow-[0_10px_35px_rgba(0,0,0,0.12)] transition-all duration-200 sm:min-h-0 sm:rounded-2xl sm:p-4 ${severity === level ? "border-[var(--accent)]/60 bg-[var(--accent-dim)]" : "border-[var(--border)] bg-[var(--panel)] hover:border-[var(--accent)]/30 hover:bg-[var(--panel-raised)]"}`}>
            <span className="block text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--text-dim)]">{level}</span>
            <span className="mono mt-2 block text-2xl tracking-tight">{count(level)}</span>
          </motion.button>
        ))}
      </section>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.35 }} className="mx-auto mb-6 flex w-full max-w-7xl flex-col gap-3 sm:flex-row">
        <label className="relative flex-1">
          <span className="sr-only">Search findings</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search protocol, function, token, or summary…" className="w-full rounded-xl border border-[var(--border)] bg-[var(--panel)] px-4 py-3 text-base outline-none placeholder:text-[var(--text-dim)] focus:border-[var(--accent)]/60 sm:text-sm" />
        </label>
        <button type="button" onClick={() => { setQuery(""); setSeverity("all"); }} className="rounded-2xl border border-[var(--border)] px-4 py-3 text-sm text-[var(--text-dim)] transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--panel)] hover:text-[var(--text)]">Reset filters</button>
      </motion.div>

      <div className="mx-auto mb-3 flex w-full max-w-7xl items-center justify-between border-b border-[var(--border)] pb-3">
        <span className="mono text-[10px] uppercase tracking-[0.16em] text-[var(--text-dim)]">Finding queue</span>
        <span className="text-xs text-[var(--text-dim)]">{visibleFindings.length} shown · severity first</span>
      </div>

      <div className="mx-auto grid w-full max-w-7xl gap-6 md:grid-cols-[320px_minmax(0,1fr)] lg:gap-8">
        <motion.section layout aria-label="Risk findings" className="flex flex-col gap-3">
          {visibleFindings.length ? visibleFindings.map((finding, index) => <FindingCard key={finding.id} finding={finding} index={index} active={finding.id === selected?.id} onSelect={() => setSelectedId(finding.id)} />) : <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-5 text-sm text-[var(--text-dim)]">No findings match the current filters.</div>}
        </motion.section>

        <section aria-label="Selected finding" className="min-h-[320px] rounded-2xl border border-[var(--border)] bg-[rgba(12,17,25,0.58)] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.14)] sm:rounded-3xl sm:p-6">
          <AnimatePresence mode="wait">
            {selected && <motion.div key={selected.id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.25 }}>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 className="mono break-words text-base text-[var(--text)] sm:text-lg">{selected.protocol} <span className="text-[var(--text-dim)]">/</span> {selected.entry}()</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--text-dim)]">{selected.summary}</p>
                  <p className="mono mt-3 text-[10px] text-[var(--text-dim)] sm:text-xs">{selected.nodes.length} nodes · {selected.edges.length} edges · {selected.token}</p>
                </div>
                <button type="button" onClick={copyFinding} className="w-fit rounded-lg border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-dim)] hover:border-[var(--accent)]/40 hover:text-[var(--text)]">{copied ? "Copied" : "Copy evidence"}</button>
              </div>
              <EvidenceGraph finding={selected} />
            </motion.div>}
          </AnimatePresence>
        </section>
      </div>
    </main>
    </MotionConfig>
  );
}
