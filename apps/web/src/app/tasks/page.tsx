"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { fetchFromIpfs } from "@/lib/ipfs";
import { readAccountData } from "@/lib/stellar";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useFreighter } from "@/hooks/useFreighter";

interface Task {
  id: string;
  skillId: string;
  title: string;
  dataSource: string;
  metrics: string[];
  rewardPerUser: number;
  durationDays: number;
  status: "pending" | "accepted" | "rejected" | "completed" | "expired";
  expiresAt: string;
}

interface SkillItem {
  id: string;
  title: string;
  dataSource: string;
  metrics?: string[];
  rewardPerUser: number;
  durationDays?: number;
  status: string;
  expiresAt: string;
}

export default function TasksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { toast } = useToast();
  const freighter = useFreighter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;

    const loadTasks = async () => {
      try {
        const data = await apiFetch<{ skills: SkillItem[] }>("/api/skills");
        const mapped: Task[] = (data.skills || []).map((s) => ({
          id: s.id,
          skillId: s.id,
          title: s.title,
          dataSource: s.dataSource,
          metrics: s.metrics ?? [],
          rewardPerUser: s.rewardPerUser,
          durationDays: s.durationDays ?? 30,
          status: "pending" as const,
          expiresAt: s.expiresAt,
        }));
        setTasks(mapped);
        return;
      } catch (err) {
        console.warn("[tasks] API task list unavailable, falling back to on-chain index:", err);
      }

      try {
        const platformAddress = process.env.NEXT_PUBLIC_PLATFORM_STELLAR_ADDRESS;
        if (!platformAddress) throw new Error("NEXT_PUBLIC_PLATFORM_STELLAR_ADDRESS missing");

        const accountData = await readAccountData(platformAddress);
        const skillEntries = Array.from(accountData.entries())
          .filter(([k, v]) => k.startsWith("sk:") && v)
          .slice(0, 50);

        const chainTasks: Task[] = [];
        for (const [, cid] of skillEntries) {
          try {
            const skill = await fetchFromIpfs<{
              id?: string;
              title?: string;
              dataSource?: string;
              metrics?: string[];
              rewardPerUser?: number;
              durationDays?: number;
              expiresAt?: string;
            }>(cid);

            const skillId = skill.id || crypto.randomUUID();
            chainTasks.push({
              id: skillId,
              skillId,
              title: skill.title || "On-chain skill",
              dataSource: skill.dataSource || "unknown",
              metrics: skill.metrics || [],
              rewardPerUser: Number(skill.rewardPerUser || 0),
              durationDays: Number(skill.durationDays || 30),
              status: "pending",
              expiresAt: skill.expiresAt || new Date(Date.now() + 7 * 86400000).toISOString(),
            });
          } catch {
            // skip invalid cid payloads
          }
        }

        setTasks(chainTasks);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to load tasks";
        toast(msg, "error");
        setTasks([]);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, [status, toast]);

  const handleDecision = async (
    skillId: string,
    decision: "ACCEPT" | "REJECT"
  ) => {
    const user = session?.user as { pseudoId?: string; stellarAddress?: string } | undefined;
    const pseudoId = user?.pseudoId || user?.stellarAddress;
    const publicKey = user?.stellarAddress || user?.pseudoId;
    if (!pseudoId || !publicKey) {
      toast("Wallet session not found", "error");
      return;
    }
    setActionLoading(skillId);

    try {
      let txHash: string | null = null;
      if (decision === "ACCEPT") {
        const pk = await freighter.connect();
        if (!pk || pk !== publicKey) {
          toast("Freighter cüzdan adresi ile oturum adresi uyuşmuyor", "error");
          throw new Error("Address mismatch");
        }
        txHash = await freighter.signAndSubmitConsentTx(skillId, pseudoId, publicKey, decision);
        if (!txHash) {
          throw new Error("Consent transaction failed");
        }
      }

      await apiFetch("/api/consent/record", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          pseudoId,
          publicKey,
          decision,
          txHash,
        }),
      });

      setTasks((prev) =>
        prev.map((t) =>
          t.skillId === skillId
            ? { ...t, status: decision === "ACCEPT" ? "accepted" : "rejected" }
            : t
        )
      );

      toast(
        decision === "ACCEPT"
          ? "Consent granted. Proof pipeline starting."
          : "Task declined.",
        decision === "ACCEPT" ? "success" : "info"
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to record decision";
      toast(msg, "error");
    } finally {
      setActionLoading(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 rounded bg-slate-900" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 rounded-lg bg-slate-900" />
          ))}
        </div>
      </div>
    );
  }

  const pending = tasks.filter((t) => t.status === "pending");
  const active = tasks.filter(
    (t) => t.status === "accepted" || t.status === "completed"
  );
  const rejected = tasks.filter((t) => t.status === "rejected");

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <div>
        <span className="flow-badge">Task Queue</span>
        <h1 className="mt-3 text-3xl font-bold text-slate-100">Tasks</h1>
        <p className="mt-2 text-sm text-slate-400">
          Grant consent on pending tasks to start the proof pipeline. Consent is recorded on Stellar.
        </p>
      </div>

      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300 mb-3">
            Pending Consent ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((task) => (
              <div key={task.skillId} className="flow-surface rounded-xl p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">
                      {task.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {task.dataSource}
                      {task.metrics.length > 0 && ` — ${task.metrics.join(", ")}`}
                      {" — "}
                      <span className="font-medium text-emerald-300">
                        {task.rewardPerUser} USDC
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Duration: {task.durationDays} days
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={actionLoading !== null}
                      isLoading={actionLoading === task.skillId}
                      onClick={() => handleDecision(task.skillId, "ACCEPT")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading !== null}
                      isLoading={actionLoading === task.skillId}
                      onClick={() => handleDecision(task.skillId, "REJECT")}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
            Active ({active.length})
          </h2>
          <div className="space-y-3">
            {active.map((task) => (
              <div key={task.skillId} className="flow-surface rounded-xl p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">
                      {task.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      {task.dataSource} — {task.rewardPerUser} USDC —{" "}
                      {task.status === "completed"
                        ? "Completed, awaiting settlement"
                        : "Consent granted, awaiting proof"}
                    </p>
                  </div>
                  <span className={`flow-status-badge ${task.status === "completed" ? "locked" : "active"}`}>
                    {task.status === "completed" ? "Completed" : "Active"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {rejected.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Declined ({rejected.length})
          </h2>
          <div className="space-y-3">
            {rejected.map((task) => (
              <div key={task.skillId} className="flow-surface rounded-xl p-5 opacity-60">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-300">
                      {task.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">Declined</p>
                  </div>
                  <span className="flow-status-badge rejected">Declined</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tasks.length === 0 && (
        <div className="flow-surface rounded-xl py-16 text-center">
          <p className="text-slate-400">No tasks available yet.</p>
          <p className="text-sm text-slate-500 mt-2">
            Tasks are also delivered via WhatsApp/Telegram through your OpenClaw bot.
          </p>
        </div>
      )}
    </div>
  );
}
