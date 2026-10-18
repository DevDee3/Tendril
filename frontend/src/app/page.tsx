import Dashboard from "@/components/Dashboard";
import { getFindings, type Finding } from "@/lib/findings";
import { Suspense } from "react";
import { getTendrilApiToken } from "@/lib/serverConfig";

export const dynamic = "force-dynamic";

async function loadFindings(): Promise<{ findings: Finding[]; live: boolean }> {
  const apiUrl = process.env.TENDRIL_API_URL || "http://127.0.0.1:8787";
  const token = getTendrilApiToken();
  try {
    const response = await fetch(`${apiUrl}/api/findings?graph=tendril`, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) throw new Error(`API returned ${response.status}`);
    const payload = await response.json();
    if (!Array.isArray(payload.findings)) throw new Error("Invalid findings response");
    return { findings: payload.findings, live: true };
  } catch {
    return { findings: process.env.NODE_ENV === "production" ? [] : getFindings(), live: false };
  }
}

async function LiveHome() {
  const { findings, live } = await loadFindings();
  return (
    <>
      {!live && <div className="fixed bottom-4 right-4 z-10 rounded-md border border-[var(--border)] bg-[var(--panel)] px-3 py-2 text-xs text-[var(--text-dim)]">{process.env.NODE_ENV === "production" ? "Live analysis unavailable" : "Demo data · API unavailable"}</div>}
      <Dashboard findings={findings} />
    </>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg)]" />}>
      <LiveHome />
    </Suspense>
  );
}
