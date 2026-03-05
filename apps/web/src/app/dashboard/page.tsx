"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface Skill {
  id: string;
  title: string;
  dataSource: string;
  rewardPerUser: number;
  status: string;
}

interface EscrowEntry {
  id: string;
  title: string;
  totalBudget: string;
  locked: string;
  released: string;
  status: string;
  txHash?: string;
}

interface Proof {
  proofHash: string;
  skillId: string;
  provider: string;
  metric: string;
  status: string;
  timestamp: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [escrows, setEscrows] = useState<EscrowEntry[]>([]);
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);

  const [showBotSetup, setShowBotSetup] = useState(false);
  const [botUrl, setBotUrl] = useState("");
  const [botToken, setBotToken] = useState("");
  const [botSaving, setBotSaving] = useState(false);
  const [botSaved, setBotSaved] = useState(false);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    Promise.all([
      apiFetch<{ skills: Skill[] }>("/api/skills").catch(() => ({ skills: [] })),
      apiFetch<{ escrows: EscrowEntry[] }>(`/api/escrow/list?address=${stellarAddress}`).catch(() => ({ escrows: [] })),
      fetch(`${apiUrl}/api/proofs/list`).then((r) => r.json()).catch(() => ({ proofs: [] })),
    ]).then(([skillsData, escrowData, proofsData]) => {
      setSkills(skillsData.skills || []);
      setEscrows(escrowData.escrows || []);
      setProofs(proofsData.proofs || []);
      setLoading(false);
    });
  }, [status, stellarAddress]);

  const handleSaveBot = async () => {
    setBotSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/provider/bot-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stellarAddress, openclawUrl: botUrl, openclawToken: botToken }),
      });
      if (res.ok) {
        setBotSaved(true);
        setTimeout(() => setBotSaved(false), 3000);
      }
    } catch {
      // silently fail
    } finally {
      setBotSaving(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-60 rounded bg-slate-900" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalLocked = escrows.reduce((sum, e) => sum + parseFloat(e.locked || "0"), 0);
  const totalReleased = escrows.reduce((sum, e) => sum + parseFloat(e.released || "0"), 0);
  const verifiedProofs = proofs.filter((p) => p.status === "verified").length;
  const verifiedVolume = totalLocked + totalReleased;
  const totalSettlements = escrows.filter((e) => e.status === "released").length;
  const proofSuccessRate = proofs.length > 0 ? (verifiedProofs / proofs.length) * 100 : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="flow-badge">Dashboard</span>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">
            Welcome, <span className="font-mono text-slate-200">{session?.user?.pseudoId?.slice(0, 8)}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/buy" className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors">
            Buy Data
          </Link>
          <Link href="/sell" className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors">
            Sell Data
          </Link>
          <Link href="/marketplace" className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors">
            Marketplace
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Verified Volume</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{verifiedVolume.toFixed(2)} USDC</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active Programs</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{skills.length}</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Settlements</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{totalSettlements}</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Proof Success</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{proofSuccessRate.toFixed(1)}%</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="flow-surface rounded-xl xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Active Data Programs</h2>
            <span className="text-xs text-slate-500">Policy → Proof → Settlement</span>
          </div>
          {skills.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No active programs yet.</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {skills.map((skill) => (
                <div key={skill.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">{skill.title}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {skill.dataSource} | {skill.rewardPerUser} USDC/epoch
                    </p>
                  </div>
                  <span className={`flow-status-badge ${skill.status}`}>
                    {skill.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flow-surface rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">OpenClaw Bot</h2>
              <p className="text-xs text-slate-500">Task delivery & proof pipeline</p>
            </div>
            <button onClick={() => setShowBotSetup(!showBotSetup)} className="text-xs text-emerald-300 hover:text-emerald-200 transition-colors">
              {showBotSetup ? "Close" : "Configure"}
            </button>
          </div>
          {showBotSetup ? (
            <div className="space-y-3 p-4">
              <div>
                <label className="flow-label-sm">Bot Instance URL</label>
                <input
                  type="url"
                  value={botUrl}
                  onChange={(e) => setBotUrl(e.target.value)}
                  placeholder="https://your-openclaw-instance.com"
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">API Token</label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Bearer token for /hooks/agent"
                  className="flow-input"
                />
              </div>
              <button
                onClick={handleSaveBot}
                disabled={botSaving || !botUrl || !botToken}
                className="w-full rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
              >
                {botSaving ? "Saving..." : "Save Configuration"}
              </button>
              {botSaved && <span className="text-xs text-emerald-300">Configuration saved successfully.</span>}
            </div>
          ) : (
            <div className="p-4 text-sm text-slate-500">
              Connect your self-hosted OpenClaw instance to receive tasks and automate proof generation.
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flow-surface rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Settlement Timeline</h2>
            <span className="text-xs text-slate-500">70% / 20% / 10% split</span>
          </div>
          {escrows.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No settlement records yet.</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {escrows.slice(0, 6).map((entry) => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-slate-100">{entry.title}</p>
                    <span className={`flow-status-badge ${entry.status}`}>
                      {entry.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Budget: {entry.totalBudget} USDC | Locked: {entry.locked} | Released: {entry.released}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flow-surface rounded-xl">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Proof Ledger</h2>
          </div>
          {proofs.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No proof records yet.</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {proofs.slice(0, 6).map((proof) => (
                <div key={proof.proofHash} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <span className="font-mono text-sm text-slate-200">{proof.proofHash.slice(0, 12)}...</span>
                    <p className="mt-1 text-xs text-slate-500">
                      {proof.provider} / {proof.metric}
                    </p>
                  </div>
                  <span className={`flow-status-badge ${proof.status}`}>
                    {proof.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
