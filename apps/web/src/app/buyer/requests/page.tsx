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
  type SkillData,
  type BatchData,
} from "@/lib/chain-reader";

export default function BuyerRequestsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [chainState, setChainState] = useState<DashboardChainState | null>(null);
  const [loading, setLoading] = useState(true);
  const [chainError, setChainError] = useState<string | null>(null);

  /* Batch counts per escrow */
  const [batchCounts, setBatchCounts] = useState<Map<string, number>>(new Map());

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

  /* Load batch counts for each escrow */
  useEffect(() => {
    if (!chainState?.userEscrows?.length) return;

    const escrowIds = chainState.userEscrows
      .map((e) => e.data?.id)
      .filter(Boolean) as string[];

    Promise.all(
      escrowIds.map(async (id) => {
        const batches = await readBatchesForEscrow(id);
        return { id, count: batches.length };
      })
    )
      .then((results) => {
        const map = new Map<string, number>();
        for (const r of results) map.set(r.id, r.count);
        setBatchCounts(map);
      })
      .catch(() => {});
  }, [chainState?.userEscrows]);

  /* Skills created by this buyer */
  const buyerSkills: ChainEntry<SkillData>[] =
    chainState?.userSkills?.filter((s) => s.ipfsResolved) || [];

  /* Derive status label */
  const getStatusInfo = (skill: ChainEntry<SkillData>) => {
    const s = skill.data?.status || "active";
    switch (s) {
      case "completed":
        return { label: "Completed", cls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300" };
      case "expired":
        return { label: "Expired", cls: "border-slate-600 bg-slate-800 text-slate-400" };
      default:
        return { label: "Active", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
    }
  };

  /* Loading skeleton */
  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-900" />
          <div className="h-4 w-40 rounded bg-slate-900" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <Link
            href="/buyer/dashboard"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            &larr; Back to Dashboard
          </Link>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">My Data Requests</h1>
          <p className="mt-2 text-sm text-slate-400">
            All skills published from your wallet. Track progress and batch deliveries.
          </p>
        </div>
        <Link
          href="/buyer/request"
          className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors shrink-0"
        >
          Create New Request
        </Link>
      </div>

      {/* Chain error */}
      {chainError && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">
          {chainError}
        </div>
      )}

      {/* Requests list */}
      <div className="flow-surface rounded-xl">
        {buyerSkills.length === 0 ? (
          <div className="px-4 py-16 text-center">
            <p className="text-sm text-slate-500">
              No requests yet. Create your first data request.
            </p>
            <Link
              href="/buyer/request"
              className="mt-4 inline-block rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
            >
              Create Data Request
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {buyerSkills.map((skill) => {
              const statusInfo = getStatusInfo(skill);
              const escrow = chainState?.userEscrows?.find(
                (e) => e.data?.skillId === skill.data?.id
              );
              const escrowId = escrow?.data?.id;
              const delivered = escrowId ? batchCounts.get(escrowId) || 0 : 0;
              const totalBatches = skill.data?.targetCount
                ? Math.ceil((skill.data.targetCount || 10) / 10)
                : 0;
              const batchProgress =
                totalBatches > 0 ? Math.min((delivered / totalBatches) * 100, 100) : 0;

              return (
                <Link
                  key={skill.key}
                  href={`/buyer/requests/${skill.data?.id || skill.key.slice(3)}`}
                  className="block px-4 py-4 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      {/* Title row */}
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-100 truncate">
                          {skill.data?.title || skill.key}
                        </h3>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] border ${statusInfo.cls}`}
                        >
                          {statusInfo.label}
                        </span>
                      </div>

                      {/* Details row */}
                      <p className="mt-1 text-xs text-slate-500">
                        {skill.data?.dataSource || "---"}
                        {" | "}
                        <span className="font-medium text-emerald-300">
                          {skill.data?.totalBudget || 0} USDC
                        </span>
                        {skill.data?.createdAt && (
                          <>
                            {" | "}
                            {skill.data.createdAt.split("T")[0]}
                          </>
                        )}
                      </p>

                      {/* Metrics */}
                      {skill.data?.metrics && skill.data.metrics.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {skill.data.metrics.slice(0, 5).map((m) => (
                            <span
                              key={m}
                              className="rounded-full border border-slate-700 bg-slate-900/40 px-1.5 py-0.5 text-[10px] text-slate-400"
                            >
                              {m}
                            </span>
                          ))}
                          {skill.data.metrics.length > 5 && (
                            <span className="text-[10px] text-slate-600">
                              +{skill.data.metrics.length - 5} more
                            </span>
                          )}
                        </div>
                      )}

                      {/* Batch progress */}
                      {totalBatches > 0 && (
                        <div className="mt-2 max-w-xs">
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                            <span>
                              {delivered}/{totalBatches} batches
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

                    {/* Arrow */}
                    <div className="flex flex-col items-end gap-1 shrink-0 pt-1">
                      <svg
                        className="h-4 w-4 text-slate-600"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                      {skill.ipfsResolved && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-300">
                          IPFS
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Summary footer */}
      {buyerSkills.length > 0 && (
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span>
            {buyerSkills.length} request{buyerSkills.length !== 1 ? "s" : ""} total
          </span>
          <span>
            All data read directly from Stellar testnet + IPFS
          </span>
        </div>
      )}
    </div>
  );
}
