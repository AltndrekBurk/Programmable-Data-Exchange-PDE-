"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";

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

export default function TasksPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      apiFetch<{ skills: Task[] }>("/api/skills")
        .then((data) => {
          setTasks(
            (data.skills || []).map((s) => ({
              ...s,
              skillId: s.id,
              status: "pending" as const,
              durationDays: 30,
            }))
          );
        })
        .catch(() => setTasks([]))
        .finally(() => setLoading(false));
    }
  }, [status]);

  const handleDecision = async (
    skillId: string,
    decision: "ACCEPT" | "REJECT"
  ) => {
    if (!session?.user?.pseudoId) return;
    setActionLoading(skillId);

    try {
      await apiFetch("/api/consent/record", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          pseudoId: session.user.pseudoId,
          decision,
        }),
      });

      setTasks((prev) =>
        prev.map((t) =>
          t.skillId === skillId
            ? {
                ...t,
                status: decision === "ACCEPT" ? "accepted" : "rejected",
              }
            : t
        )
      );
    } catch {
      // silently fail — could show toast
    } finally {
      setActionLoading(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-40 bg-gray-200 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-lg" />
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
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Gorevler</h1>

      {/* Pending */}
      {pending.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Bekleyen ({pending.length})
          </h2>
          <div className="space-y-3">
            {pending.map((task) => (
              <div
                key={task.skillId}
                className="rounded-lg border border-yellow-200 bg-yellow-50 p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">
                      {task.title}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {task.dataSource} — {task.metrics?.join(", ")} —{" "}
                      {task.rewardPerUser} USDC
                    </p>
                  </div>
                  <div className="flex gap-2 ml-4">
                    <Button
                      size="sm"
                      variant="primary"
                      isLoading={actionLoading === task.skillId}
                      onClick={() =>
                        handleDecision(task.skillId, "ACCEPT")
                      }
                    >
                      Kabul
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      isLoading={actionLoading === task.skillId}
                      onClick={() =>
                        handleDecision(task.skillId, "REJECT")
                      }
                    >
                      Red
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active */}
      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Aktif ({active.length})
          </h2>
          <div className="space-y-3">
            {active.map((task) => (
              <div
                key={task.skillId}
                className="rounded-lg border border-green-200 bg-green-50 p-4"
              >
                <h3 className="text-sm font-semibold text-gray-900">
                  {task.title}
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  {task.dataSource} — {task.rewardPerUser} USDC — Kabul
                  edildi, proof bekleniyor
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Rejected */}
      {rejected.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Reddedilen ({rejected.length})
          </h2>
          <div className="space-y-3">
            {rejected.map((task) => (
              <div
                key={task.skillId}
                className="rounded-lg border border-gray-200 p-4 opacity-60"
              >
                <h3 className="text-sm font-semibold text-gray-900">
                  {task.title}
                </h3>
                <p className="text-xs text-gray-500 mt-1">Reddedildi</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {tasks.length === 0 && (
        <div className="text-center py-16">
          <p className="text-sm text-gray-500">Henuz gorev yok.</p>
        </div>
      )}
    </div>
  );
}
