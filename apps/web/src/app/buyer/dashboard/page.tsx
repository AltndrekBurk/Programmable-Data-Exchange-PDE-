"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  readDashboardState,
  readBatchesForEscrow,
  type DashboardChainState,
  type ChainEntry,
  type BatchData,
  type SkillData,
  type EscrowData,
} from "@/lib/chain-reader";

export default function BuyerDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [chainState, setChainState] = useState<DashboardChainState | null>(null);
  const [loading, setLoading] = useState(true);
  const [chainError, setChainError] = useState<string | null>(null);

  /* Recent batch deliveries across all escrows */
  const [recentBatches, setRecentBatches] = useState<ChainEntry<BatchData>[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  /* Load on-chain state */
  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    readDashboardState(stellarAddress)
      .then((data) => setChainState(data))
      .catch((err) => setChainError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [status, stellarAddress]);

  /* Load batches for all user escrows */
  useEffect(() => {
    if (!chainState?.userEscrows?.length) return;
    setBatchesLoading(true);

    const escrowIds = chainState.userEscrows
      .map((e) => e.data?.id)
      .filter(Boolean) as string[];

    Promise.all(escrowIds.map((id) => readBatchesForEscrow(id)))
      .then((results) => {
        const all = results.flat().sort((a, b) => {
          const ta = a.data?.createdAt || "";
          const tb = b.data?.createdAt || "";
          return tb.localeCompare(ta);
        });
        setRecentBatches(all);
      })
      .catch(() => setRecentBatches([]))
      .finally(() => setBatchesLoading(false));
  }, [chainState?.userEscrows]);

  /* Computed stats */
  const buyerSkills = chainState?.userSkills?.filter((s) => {
    // Skills created by this buyer (either creator field matches or all resolved)
    return s.ipfsResolved;
  }) || [];

  const totalBudgetLocked =
    chainState?.userEscrows?.reduce((sum, e) => sum + (e.data?.locked || 0), 0) || 0;

  const proofsVerified =
    chainState?.userProofs?.filter((p) => p.data?.status === "verified").length || 0;

  const totalBatchesReceived = recentBatches.length;

  /* Loading skeleton */
  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-slate-900" />
          <div className="h-4 w-40 rounded bg-slate-900" />
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-lg bg-slate-900" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-slate-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="flow-badge">Buyer</span>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">Buyer Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">
            Manage your data requests, track deliveries, and monitor escrow budgets.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/buyer/request"
            className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
          >
            Create New Request
          </Link>
          <Link
            href="/buyer/requests"
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors"
          >
            All Requests
          </Link>
        </div>
      </div>

      {/* Chain error */}
      {chainError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">
          {chainError}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active Requests</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{buyerSkills.length}</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Batches Received</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{totalBatchesReceived}</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Proofs Verified</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{proofsVerified}</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Budget Locked</p>
          <p className="mt-1 text-2xl font-bold text-cyan-300">
            {totalBudgetLocked.toFixed(2)} USDC
          </p>
        </div>
      </div>

      {/* Active Requests */}
      <div className="flow-surface rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Active Requests
          </h2>
          <span className="text-xs text-slate-500">
            Skills created on-chain by your address
          </span>
        </div>
        {buyerSkills.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No active requests yet.{" "}
            <Link href="/buyer/request" className="text-emerald-300 hover:underline">
              Create your first data request
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {buyerSkills.map((skill) => {
              const escrow = chainState?.userEscrows?.find(
                (e) => e.data?.skillId === skill.data?.id
              );
              const batchCount = recentBatches.filter(
                (b) => b.data?.escrowId === escrow?.data?.id
              ).length;
              const totalBatches = skill.data?.targetCount
                ? Math.ceil(
                    (skill.data.targetCount || 10) / 10
                  )
                : 0;
              const batchProgress =
                totalBatches > 0 ? Math.min((batchCount / totalBatches) * 100, 100) : 0;

              return (
                <Link
                  key={skill.key}
                  href={`/buyer/requests/${skill.data?.id || skill.key.slice(3)}`}
                  className="block px-4 py-4 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-100 truncate">
                          {skill.data?.title || skill.key}
                        </h3>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] border ${
                            skill.data?.status === "completed"
                              ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300"
                              : skill.data?.status === "expired"
                                ? "border-slate-600 bg-slate-800 text-slate-400"
                                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          }`}
                        >
                          {skill.data?.status || "active"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {skill.data?.dataSource || "---"} |{" "}
                        <span className="font-medium text-emerald-300">
                          {skill.data?.totalBudget || 0} USDC
                        </span>
                        {skill.data?.metrics?.length
                          ? ` | ${skill.data.metrics.slice(0, 3).join(", ")}`
                          : ""}
                      </p>

                      {/* Batch progress */}
                      {escrow && totalBatches > 0 && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span>
                              {batchCount}/{totalBatches} batches delivered
                            </span>
                            <span>{batchProgress.toFixed(0)}%</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-800">
                            <div
                              className="h-1.5 rounded-full bg-emerald-500 transition-all"
                              style={{ width: `${batchProgress}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <svg
                      className="h-4 w-4 shrink-0 text-slate-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Batch Deliveries */}
      <div className="flow-surface rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Recent Batch Deliveries
          </h2>
          <span className="text-xs text-slate-500">Latest data batches from providers</span>
        </div>
        {batchesLoading ? (
          <div className="px-4 py-8 text-center">
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded bg-slate-900" />
              ))}
            </div>
          </div>
        ) : recentBatches.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-500">
            No batch deliveries yet. Batches appear here when providers submit verified data.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {recentBatches.slice(0, 8).map((batch, i) => (
              <div
                key={batch.key || i}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-slate-200">
                      Batch #{batch.data?.batchIndex ?? i + 1}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] border ${
                        batch.ipfsResolved
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-slate-600 bg-slate-800 text-slate-400"
                      }`}
                    >
                      {batch.ipfsResolved ? "IPFS verified" : "CID only"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Escrow: {(batch.data?.escrowId || "---").slice(0, 12)}...
                    {batch.data?.rows?.length
                      ? ` | ${batch.data.rows.length} rows`
                      : ""}
                    {batch.data?.createdAt
                      ? ` | ${batch.data.createdAt.split("T")[0]}`
                      : ""}
                  </p>
                </div>
                <span className="text-xs text-slate-500 font-mono shrink-0">
                  {batch.data?.sellerAddress?.slice(0, 8)}...
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
