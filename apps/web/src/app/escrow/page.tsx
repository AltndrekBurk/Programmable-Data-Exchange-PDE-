"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface EscrowEntry {
  id: string;
  skillId: string;
  title: string;
  totalBudget: string;
  locked: string;
  released: string;
  providerShare: string;
  platformShare: string;
  disputePool: string;
  status: "locked" | "releasing" | "released" | "disputed" | "refunded";
  createdAt: string;
  txHash?: string;
}

export default function EscrowPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [escrows, setEscrows] = useState<EscrowEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    const address = session?.user?.stellarAddress;
    const query = address ? `?address=${address}` : "";

    apiFetch<{ escrows: EscrowEntry[] }>(`/api/escrow/list${query}`)
      .then((data) => setEscrows(data.escrows || []))
      .catch(() => setEscrows([]))
      .finally(() => setLoading(false));
  }, [status, router, session]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-900" />
          <div className="grid grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-900" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalLocked = escrows.reduce((sum, e) => sum + parseFloat(e.locked || "0"), 0);
  const totalReleased = escrows.reduce((sum, e) => sum + parseFloat(e.released || "0"), 0);
  const totalBudget = escrows.reduce((sum, e) => sum + parseFloat(e.totalBudget || "0"), 0);
  const activeCount = escrows.filter((e) => e.status === "locked").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div>
        <span className="flow-badge">Escrow Tracker</span>
        <h1 className="mt-3 text-3xl font-bold text-slate-100">Escrow Status</h1>
        <p className="mt-2 text-sm text-slate-400">
          USDC escrow managed by Soroban smart contract on Stellar. Atomic 3-way release on verified proof.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Budget</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{totalBudget.toFixed(2)} USDC</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Locked</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">{totalLocked.toFixed(2)} USDC</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Released</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{totalReleased.toFixed(2)} USDC</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active Escrows</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{activeCount}</p>
        </div>
      </div>

      <div className="flow-surface rounded-xl p-4">
        <p className="text-sm font-medium text-slate-300 mb-2">Settlement Distribution (Atomic)</p>
        <div className="flex gap-4 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-slate-400">70% Provider</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-cyan-400" />
            <span className="text-slate-400">20% Platform</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-slate-400">10% Dispute Pool</span>
          </span>
        </div>
      </div>

      {escrows.length === 0 ? (
        <div className="flow-surface rounded-xl py-16 text-center">
          <p className="text-slate-400">No escrow records yet.</p>
          <p className="text-sm text-slate-500 mt-2">
            Escrow entries appear when USDC is locked for a Buy Data program.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {escrows.map((entry) => (
            <div
              key={entry.id}
              className="flow-surface rounded-xl p-5 transition-all hover:border-slate-600"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-100">{entry.title}</h3>
                <span className={`flow-status-badge ${entry.status}`}>
                  {entry.status}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                <span>Budget: <span className="text-slate-200">{entry.totalBudget} USDC</span></span>
                <span>Locked: <span className="text-cyan-300">{entry.locked} USDC</span></span>
                <span>Released: <span className="text-emerald-300">{entry.released} USDC</span></span>
              </div>
              {entry.status === "released" && (
                <div className="flex gap-4 text-xs text-slate-500 mt-2 pt-2 border-t border-slate-800">
                  <span>Provider: {entry.providerShare} USDC</span>
                  <span>Platform: {entry.platformShare} USDC</span>
                  <span>Dispute: {entry.disputePool} USDC</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-500">
                  {new Date(entry.createdAt).toLocaleString("en-US")}
                </span>
                {entry.txHash && (
                  <span className="text-xs text-slate-500 font-mono">
                    TX: {entry.txHash.slice(0, 16)}...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
