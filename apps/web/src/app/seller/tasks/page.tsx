"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { useFreighter } from "@/hooks/useFreighter";
import {
  readActiveSkills,
  readBatchesForEscrow,
  getPlatformAddress,
  type SkillData,
  type ChainEntry,
} from "@/lib/chain-reader";
import { readAccountData, PREFIXES } from "@/lib/stellar";
import { fetchFromIpfs } from "@/lib/ipfs";

/* ── Types ── */
interface SellerPolicy {
  dataSources: string[];
  allowedMetrics: string[];
  deniedMetrics: string[];
  minPricePerRequest: number;
  maxRowsPerRequest: number;
  maxConcurrentTasks: number;
}

interface TaskItem {
  skillId: string;
  title: string;
  description: string;
  dataSource: string;
  metrics: string[];
  budget: number;
  durationDays: number;
  buyerAddress: string;
  rewardPerUser: number;
  policyMatch: boolean;
  policyMismatchReason: string;
  status: "available" | "accepted" | "rejected";
  batchesSent: number;
  totalBatches: number;
  cid: string;
}

export default function SellerTasksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const freighter = useFreighter();

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [sellerPolicy, setSellerPolicy] = useState<SellerPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "matching" | "accepted">("all");

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  /* ── Load tasks and seller policy from chain ── */
  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    const load = async () => {
      try {
        // Load seller policy
        const platformAddr = getPlatformAddress();
        let policy: SellerPolicy | null = null;

        if (platformAddr) {
          const accountData = await readAccountData(platformAddr);
          const providerKey = `${PREFIXES.provider}${stellarAddress.slice(0, 24)}`;
          const cid = accountData.get(providerKey);

          if (cid) {
            try {
              const data = await fetchFromIpfs<Record<string, unknown>>(cid);
              const p = (data?.policy as Record<string, unknown>) || data || {};
              policy = {
                dataSources: Array.isArray(p.dataSources) ? p.dataSources as string[] : [],
                allowedMetrics: Array.isArray(p.allowedMetrics) ? p.allowedMetrics as string[] : [],
                deniedMetrics: Array.isArray(p.deniedMetrics) ? p.deniedMetrics as string[] : [],
                minPricePerRequest: Number(p.minPricePerRequest ?? p.minRewardPerUserUsdc ?? 0),
                maxRowsPerRequest: Number(p.maxRowsPerRequest ?? 500),
                maxConcurrentTasks: Number(p.maxConcurrentTasks ?? p.maxActivePrograms ?? 5),
              };
              setSellerPolicy(policy);
            } catch {
              // no policy found
            }
          }

          // Check existing consents
          const consentMap = new Map<string, string>();
          for (const [key, value] of accountData) {
            if (key.startsWith(PREFIXES.consent) && value.includes(stellarAddress.slice(0, 12))) {
              const skillIdPart = key.slice(PREFIXES.consent.length);
              consentMap.set(skillIdPart, value);
            }
          }
        }

        // Load all active skills from chain
        const chainSkills = await readActiveSkills();

        const taskItems: TaskItem[] = chainSkills
          .filter((s) => s.data && s.ipfsResolved)
          .map((s) => {
            const d = s.data as SkillData;
            const taskDataSource = (d.dataSource || "unknown").toLowerCase();
            const taskMetrics = d.metrics || [];
            const reward = Number(d.rewardPerUser || 0);
            const budget = Number(d.totalBudget || 0);

            // Policy matching
            let policyMatch = true;
            let policyMismatchReason = "";

            if (policy) {
              // Check data source match
              if (policy.dataSources.length > 0) {
                const sourceMatch = policy.dataSources.some(
                  (ds) => ds.toLowerCase() === taskDataSource
                );
                if (!sourceMatch) {
                  policyMatch = false;
                  policyMismatchReason = "Data source not in your offerings";
                }
              }

              // Check denied metrics
              if (policyMatch && policy.deniedMetrics.length > 0) {
                const deniedFound = taskMetrics.find((m) =>
                  policy!.deniedMetrics.includes(m.toLowerCase())
                );
                if (deniedFound) {
                  policyMatch = false;
                  policyMismatchReason = `Denied metric: ${deniedFound}`;
                }
              }

              // Check min price
              if (policyMatch && reward < policy.minPricePerRequest) {
                policyMatch = false;
                policyMismatchReason = `Below min price (${policy.minPricePerRequest} USDC)`;
              }
            }

            return {
              skillId: d.id || s.key,
              title: d.title || "Untitled Task",
              description: (d.description || "").split("\n")[0],
              dataSource: d.dataSource || "unknown",
              metrics: taskMetrics,
              budget,
              durationDays: Number(d.durationDays || 30),
              buyerAddress: d.deliveryPublicKey || "",
              rewardPerUser: reward,
              policyMatch,
              policyMismatchReason,
              status: "available",
              batchesSent: 0,
              totalBatches: 0,
              cid: s.cid,
            };
          });

        setTasks(taskItems);
      } catch (err) {
        console.error("[seller-tasks] load failed:", err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [status, stellarAddress]);

  /* ── Accept Task (consent TX) ── */
  const handleAccept = async (skillId: string) => {
    if (!session?.user?.stellarAddress || !stellarAddress) return;
    setActionLoading(skillId);

    try {
      // Sign and submit consent TX to Stellar
      const txHash = await freighter.signAndSubmitConsentTx(
        skillId,
        session.user.stellarAddress,
        stellarAddress,
        "ACCEPT"
      );

      if (!txHash) {
        setActionLoading(null);
        return;
      }

      // Notify backend
      await apiFetch("/api/consent/record", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          stellarAddress: session.user.stellarAddress,
          decision: "ACCEPT",
          txHash,
          publicKey: stellarAddress,
        }),
      });

      // Update local state
      setTasks((prev) =>
        prev.map((t) =>
          t.skillId === skillId ? { ...t, status: "accepted" as const } : t
        )
      );
    } catch (err) {
      console.error("[seller-tasks] accept failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  /* ── Reject Task (local only) ── */
  const handleReject = (skillId: string) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.skillId === skillId ? { ...t, status: "rejected" as const } : t
      )
    );
  };

  /* ── Filtered tasks ── */
  const availableTasks = tasks.filter((t) => t.status === "available");
  const acceptedTasks = tasks.filter((t) => t.status === "accepted");

  const filteredTasks =
    filter === "matching"
      ? availableTasks.filter((t) => t.policyMatch)
      : filter === "accepted"
        ? acceptedTasks
        : availableTasks;

  /* ── Loading ── */
  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-900" />
          <div className="h-4 w-80 rounded bg-slate-900" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 rounded-lg bg-slate-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="flow-badge">Seller Tasks</span>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">Available Tasks</h1>
          <p className="mt-2 text-sm text-slate-400">
            Active data requests from buyers on the network. Tasks are read directly from Stellar + IPFS.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/seller/dashboard"
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors"
          >
            Dashboard
          </Link>
          <Link
            href="/seller/policy"
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors"
          >
            Policy
          </Link>
        </div>
      </div>

      {/* ── Policy status ── */}
      {!sellerPolicy && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-300">
          No seller policy found.{" "}
          <Link href="/seller/policy" className="font-medium underline hover:text-amber-200">
            Configure your policy
          </Link>{" "}
          to see which tasks match your offerings.
        </div>
      )}

      {/* ── Filter tabs ── */}
      <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900/50 p-1 w-fit">
        {([
          { key: "all", label: `All (${availableTasks.length})` },
          { key: "matching", label: `Matching (${availableTasks.filter((t) => t.policyMatch).length})` },
          { key: "accepted", label: `Accepted (${acceptedTasks.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === key
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/40"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Task List ── */}
      {filteredTasks.length === 0 ? (
        <div className="flow-surface rounded-xl py-12 text-center text-sm text-slate-500">
          {filter === "accepted"
            ? "No accepted tasks yet. Accept tasks from the Available list."
            : filter === "matching"
              ? "No tasks match your current policy."
              : "No active data requests on the network."}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTasks.map((task) => (
            <div key={task.skillId} className="flow-surface rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">
                      {task.title}
                    </h3>
                    {/* Policy match indicator */}
                    {sellerPolicy && task.status === "available" && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium border ${
                          task.policyMatch
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                            : "border-red-500/30 bg-red-500/10 text-red-300"
                        }`}
                      >
                        {task.policyMatch ? "Match" : "Mismatch"}
                      </span>
                    )}
                    {task.status === "accepted" && (
                      <span className="flow-status-badge active">Accepted</span>
                    )}
                  </div>

                  <p className="mt-1 text-xs text-slate-400">
                    {task.dataSource} |{" "}
                    {task.metrics.slice(0, 4).join(", ")}
                    {task.metrics.length > 4 && ` +${task.metrics.length - 4}`}
                    {" | "}
                    <span className="font-medium text-emerald-300">
                      {task.rewardPerUser} USDC/request
                    </span>
                  </p>

                  {task.description && (
                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                      {task.description}
                    </p>
                  )}

                  <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-slate-500">
                    <span>Budget: {task.budget} USDC</span>
                    <span>Duration: {task.durationDays}d</span>
                    {task.buyerAddress && (
                      <span>
                        Buyer:{" "}
                        <span className="font-mono text-slate-400">
                          {task.buyerAddress.slice(0, 8)}...{task.buyerAddress.slice(-4)}
                        </span>
                      </span>
                    )}
                    <span>
                      CID: <span className="font-mono">{task.cid.slice(0, 12)}...</span>
                    </span>
                  </div>

                  {!task.policyMatch && task.policyMismatchReason && task.status === "available" && (
                    <p className="mt-1 text-[10px] text-red-400">
                      Policy mismatch: {task.policyMismatchReason}
                    </p>
                  )}

                  {/* Delivery progress for accepted tasks */}
                  {task.status === "accepted" && (
                    <div className="mt-2">
                      <p className="text-xs text-slate-400">
                        Delivery: {task.batchesSent}/{task.totalBatches || "?"} batches sent
                      </p>
                      {task.totalBatches > 0 && (
                        <div className="mt-1 h-1.5 w-full max-w-xs rounded-full bg-slate-800">
                          <div
                            className="h-1.5 rounded-full bg-emerald-500 transition-all"
                            style={{
                              width: `${Math.min((task.batchesSent / task.totalBatches) * 100, 100)}%`,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Action buttons */}
                {task.status === "available" && (
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={actionLoading !== null}
                      isLoading={actionLoading === task.skillId}
                      onClick={() => handleAccept(task.skillId)}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading !== null}
                      onClick={() => handleReject(task.skillId)}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary ── */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="flow-surface rounded-lg p-3">
          <p className="text-xs text-slate-500">Available</p>
          <p className="text-lg font-bold text-slate-100">{availableTasks.length}</p>
        </div>
        <div className="flow-surface rounded-lg p-3">
          <p className="text-xs text-slate-500">Matching Policy</p>
          <p className="text-lg font-bold text-emerald-300">
            {availableTasks.filter((t) => t.policyMatch).length}
          </p>
        </div>
        <div className="flow-surface rounded-lg p-3">
          <p className="text-xs text-slate-500">Accepted</p>
          <p className="text-lg font-bold text-slate-100">{acceptedTasks.length}</p>
        </div>
      </div>
    </div>
  );
}
