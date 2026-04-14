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
  type EscrowData,
  type BatchData,
} from "@/lib/chain-reader";
import { readAccountData, PREFIXES } from "@/lib/stellar";
import { fetchFromIpfs } from "@/lib/ipfs";
import { getPlatformAddress } from "@/lib/chain-reader";

/* ── Types ── */
interface SellerStats {
  registered: boolean;
  dataSourceCount: number;
  matchedTasks: number;
  totalEarnings: number;
}

interface ActiveDelivery {
  escrowId: string;
  skillTitle: string;
  buyerAddress: string;
  batchesSent: number;
  totalBatches: number;
  status: string;
}

interface RecentPayment {
  escrowId: string;
  batchIndex: number;
  amount: number;
  txHash: string;
  createdAt: string;
}

export default function SellerDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [chainState, setChainState] = useState<DashboardChainState | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SellerStats>({
    registered: false,
    dataSourceCount: 0,
    matchedTasks: 0,
    totalEarnings: 0,
  });
  const [deliveries, setDeliveries] = useState<ActiveDelivery[]>([]);
  const [payments, setPayments] = useState<RecentPayment[]>([]);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    const load = async () => {
      try {
        const state = await readDashboardState(stellarAddress);
        setChainState(state);

        // Compute seller stats
        const isRegistered = state.providerStatus?.registered ?? false;
        const dsCount = state.providerStatus?.dataSources?.length ?? 0;
        const matched = state.pendingConsent?.length ?? 0;

        // Earnings from released escrows where this address is provider
        const earnings = state.userEscrows
          .filter((e) => e.data?.status === "released")
          .reduce((sum, e) => sum + ((e.data?.providerShare ?? 0) || (e.data?.released ?? 0) * 0.7), 0);

        setStats({
          registered: isRegistered,
          dataSourceCount: dsCount,
          matchedTasks: matched,
          totalEarnings: earnings,
        });

        // Build active deliveries from escrows
        const activeEscrows = state.userEscrows.filter(
          (e) => e.data?.status === "locked" || e.data?.status === "releasing"
        );

        const deliveryList: ActiveDelivery[] = [];
        for (const esc of activeEscrows.slice(0, 6)) {
          let batchesSent = 0;
          let totalBatches = 1;
          try {
            const batches = await readBatchesForEscrow(esc.data?.id || esc.key);
            batchesSent = batches.length;
            if (batches.length > 0 && batches[0].data?.totalBatches) {
              totalBatches = batches[0].data.totalBatches;
            }
          } catch {
            // no batches found
          }

          deliveryList.push({
            escrowId: esc.data?.id || esc.key,
            skillTitle: esc.data?.title || "Untitled",
            buyerAddress: esc.data?.depositorAddress || "unknown",
            batchesSent,
            totalBatches,
            status: esc.data?.status || "locked",
          });
        }
        setDeliveries(deliveryList);

        // Build recent payments from batch payment entries
        const platformAddress = getPlatformAddress();
        if (platformAddress) {
          const { readAndCategorize } = await import("@/lib/chain-reader");
          const categorized = await readAndCategorize(platformAddress);
          const paymentList: RecentPayment[] = categorized.batchPayments
            .filter((bp) => bp.value.includes(stellarAddress.slice(0, 12)))
            .slice(0, 8)
            .map((bp) => {
              // Parse batch payment value: "amount:txHash:timestamp"
              const parts = bp.value.split(":");
              return {
                escrowId: bp.key.slice(PREFIXES.batchpay.length, PREFIXES.batchpay.length + 16),
                batchIndex: parseInt(parts[0]) || 0,
                amount: parseFloat(parts[1]) || 0,
                txHash: parts[2] || "",
                createdAt: parts[3] || "",
              };
            });
          setPayments(paymentList);
        }
      } catch (err) {
        console.error("[seller-dashboard] load failed:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [status, stellarAddress]);

  /* ── Loading ── */
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
          <div className="h-48 rounded-lg bg-slate-900" />
          <div className="h-48 rounded-lg bg-slate-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="flow-badge">Seller</span>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">Seller Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">
            Manage your data offerings, track deliveries, and monitor earnings.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/seller/policy"
            className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
          >
            Configure Policy
          </Link>
          <Link
            href="/seller/tasks"
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors"
          >
            View Tasks
          </Link>
          <Link
            href="/seller/bot-setup"
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors"
          >
            Bot Setup
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Registered</p>
          <p className={`mt-1 text-2xl font-bold ${stats.registered ? "text-emerald-300" : "text-red-400"}`}>
            {stats.registered ? "Yes" : "No"}
          </p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Data Sources</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{stats.dataSourceCount}</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Matched Tasks</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{stats.matchedTasks}</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Earnings</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            {stats.totalEarnings.toFixed(2)} USDC
          </p>
        </div>
      </div>

      {/* ── Registration prompt ── */}
      {!stats.registered && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          You are not registered as a seller yet.{" "}
          <Link href="/seller/policy" className="font-medium underline hover:text-amber-200">
            Set up your policy
          </Link>{" "}
          to start receiving tasks.
        </div>
      )}

      {/* ── Active Deliveries ── */}
      <div className="flow-surface rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Active Deliveries
          </h2>
          <span className="text-xs text-slate-500">Ongoing batch transfers</span>
        </div>
        {deliveries.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No active deliveries. Accept tasks to start delivering data.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {deliveries.map((d) => {
              const progress = d.totalBatches > 0 ? (d.batchesSent / d.totalBatches) * 100 : 0;
              return (
                <div key={d.escrowId} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-100 truncate">
                        {d.skillTitle}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Buyer:{" "}
                        <span className="font-mono text-slate-400">
                          {d.buyerAddress.slice(0, 8)}...{d.buyerAddress.slice(-4)}
                        </span>{" "}
                        | Escrow: <span className="font-mono">{d.escrowId.slice(0, 12)}...</span>
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className="text-xs text-slate-400">
                        {d.batchesSent}/{d.totalBatches} batches
                      </p>
                      <span className={`flow-status-badge ${d.status}`}>
                        {d.status}
                      </span>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
                    <div
                      className="h-1.5 rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Recent Payments ── */}
      <div className="flow-surface rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Recent Payments
          </h2>
          <span className="text-xs text-slate-500">x402 micro-payments received</span>
        </div>
        {payments.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            No payments recorded yet. Complete deliveries to receive payments.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {payments.map((p, i) => (
              <div key={`${p.escrowId}-${p.batchIndex}-${i}`} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200">
                    Batch #{p.batchIndex}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Escrow: <span className="font-mono">{p.escrowId.slice(0, 12)}...</span>
                    {p.txHash && (
                      <>
                        {" | "}
                        <a
                          href={`https://stellar.expert/explorer/testnet/tx/${p.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-400 hover:underline"
                        >
                          TX
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-emerald-300">
                    +{p.amount.toFixed(2)} USDC
                  </p>
                  {p.createdAt && (
                    <p className="text-[10px] text-slate-600">{p.createdAt.split("T")[0]}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick Links ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Link
          href="/seller/policy"
          className="flow-surface rounded-xl p-4 hover:border-emerald-500/30 transition-colors group"
        >
          <h3 className="text-sm font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
            Configure Policy
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Set data sources, pricing, constraints, and auto-accept rules.
          </p>
        </Link>
        <Link
          href="/seller/tasks"
          className="flow-surface rounded-xl p-4 hover:border-emerald-500/30 transition-colors group"
        >
          <h3 className="text-sm font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
            View Tasks
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Browse available data requests and accept matching tasks.
          </p>
        </Link>
        <Link
          href="/seller/bot-setup"
          className="flow-surface rounded-xl p-4 hover:border-emerald-500/30 transition-colors group"
        >
          <h3 className="text-sm font-semibold text-slate-100 group-hover:text-emerald-300 transition-colors">
            Bot Setup
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Deploy OpenClaw bot and attestor-core for automated proof delivery.
          </p>
        </Link>
      </div>
    </div>
  );
}
