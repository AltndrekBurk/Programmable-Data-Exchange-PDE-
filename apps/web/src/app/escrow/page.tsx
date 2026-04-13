"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { readUserEscrows, type ChainEntry, type EscrowData } from "@/lib/chain-reader";

export default function EscrowPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [escrows, setEscrows] = useState<ChainEntry<EscrowData>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    const address = (session?.user as { stellarAddress?: string })?.stellarAddress;
    const addr = (session?.user as { stellarAddress?: string })?.stellarAddress;
    if (!address || !addr) return;

    // Read directly from Stellar Horizon + IPFS — no backend call
    readUserEscrows(address)
      .then((data) => setEscrows(data))
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

  const totalLocked = escrows.reduce((sum, e) => sum + (e.data?.locked || 0), 0);
  const totalReleased = escrows.reduce((sum, e) => sum + (e.data?.released || 0), 0);
  const totalBudget = escrows.reduce((sum, e) => sum + (e.data?.totalBudget || 0), 0);
  const activeCount = escrows.filter((e) => e.data?.status === "locked").length;

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div>
        <span className="flow-badge">Escrow Tracker</span>
        <h1 className="mt-3 text-3xl font-bold text-slate-100">Escrow Status</h1>
        <p className="mt-2 text-sm text-slate-400">
          USDC escrow managed by Soroban smart contract on Stellar. Atomic 3-way release on verified proof.
          Data read directly from Stellar Horizon + IPFS.
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
              key={entry.key}
              className="flow-surface rounded-xl p-5 transition-all hover:border-slate-600"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">
                    {entry.data?.title || entry.key}
                  </h3>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] border ${
                      entry.ipfsResolved
                        ? "border-emerald-500/30 text-emerald-300"
                        : "border-slate-600 text-slate-400"
                    }`}
                  >
                    {entry.ipfsResolved ? "IPFS" : "CID only"}
                  </span>
                </div>
                <span className={`flow-status-badge ${entry.data?.status || "locked"}`}>
                  {entry.data?.status || "indexed"}
                </span>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-400">
                <span>Budget: <span className="text-slate-200">{entry.data?.totalBudget || 0} USDC</span></span>
                <span>Locked: <span className="text-cyan-300">{entry.data?.locked || 0} USDC</span></span>
                <span>Released: <span className="text-emerald-300">{entry.data?.released || 0} USDC</span></span>
              </div>
              {entry.data?.status === "released" && (
                <div className="flex gap-4 text-xs text-slate-500 mt-2 pt-2 border-t border-slate-800">
                  <span>Provider: {entry.data.providerShare} USDC</span>
                  <span>Platform: {entry.data.platformShare} USDC</span>
                  <span>Dispute: {entry.data.disputePool} USDC</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-800">
                <span className="text-xs text-slate-500 font-mono">
                  CID: {entry.cid.slice(0, 20)}...
                </span>
                {entry.data?.depositTxHash && (
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${entry.data.depositTxHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    View TX
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
