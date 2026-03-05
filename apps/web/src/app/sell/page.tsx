"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";
import { useFreighter } from "@/hooks/useFreighter";

const API_SOURCES = [
  { id: "fitbit", label: "Fitbit" },
  { id: "strava", label: "Strava" },
  { id: "spotify", label: "Spotify" },
  { id: "github", label: "GitHub" },
  { id: "google_fit", label: "Google Fit" },
  { id: "plaid", label: "Plaid (Bank)" },
  { id: "garmin", label: "Garmin" },
  { id: "whoop", label: "WHOOP" },
];

interface Task {
  id: string;
  skillId: string;
  title: string;
  dataSource: string;
  metrics: string[];
  rewardPerUser: number;
  durationDays: number;
  callbackUrl?: string;
  policy?: {
    maxProofAgeHours?: number;
    minWitnessCount?: number;
  };
  status: "pending" | "accepted" | "rejected" | "completed";
}

interface ProviderInfo {
  registered: boolean;
  dataSources?: string[];
  pseudoId?: string;
  policy?: ProviderPolicy;
}

interface ProviderPolicy {
  minRewardPerUserUsdc: number;
  maxProgramDurationDays: number;
  maxProofAgeHours: number;
  minWitnessCount: number;
  requireHttpsBuyerCallback: boolean;
  maxActivePrograms: number;
}

const DEFAULT_POLICY: ProviderPolicy = {
  minRewardPerUserUsdc: 0.5,
  maxProgramDurationDays: 90,
  maxProofAgeHours: 24,
  minWitnessCount: 1,
  requireHttpsBuyerCallback: true,
  maxActivePrograms: 10,
};

export default function SellDataPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [openclawUrl, setOpenclawUrl] = useState("");
  const [openclawToken, setOpenclawToken] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "telegram" | "discord">("whatsapp");
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ProviderPolicy>(DEFAULT_POLICY);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;
  const freighter = useFreighter();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    fetch(`${apiUrl}/api/provider/me?address=${stellarAddress}`)
      .then((res) => res.json())
      .then((data) => {
        setProvider(data);
        if (Array.isArray(data?.dataSources) && data.dataSources.length > 0) {
          setSelectedSources(data.dataSources);
        }
        if (data?.policy) {
          setPolicy({
            minRewardPerUserUsdc: Number(data.policy.minRewardPerUserUsdc ?? DEFAULT_POLICY.minRewardPerUserUsdc),
            maxProgramDurationDays: Number(data.policy.maxProgramDurationDays ?? DEFAULT_POLICY.maxProgramDurationDays),
            maxProofAgeHours: Number(data.policy.maxProofAgeHours ?? DEFAULT_POLICY.maxProofAgeHours),
            minWitnessCount: Number(data.policy.minWitnessCount ?? DEFAULT_POLICY.minWitnessCount),
            requireHttpsBuyerCallback: Boolean(
              data.policy.requireHttpsBuyerCallback ?? DEFAULT_POLICY.requireHttpsBuyerCallback
            ),
            maxActivePrograms: Number(data.policy.maxActivePrograms ?? DEFAULT_POLICY.maxActivePrograms),
          });
        }
      })
      .catch(() => setProvider({ registered: false }));

    apiFetch<{ skills: Task[] }>("/api/skills")
      .then((data) => {
        const mapped = (data.skills || []).map((s) => ({
          ...s,
          skillId: s.id,
          metrics: s.metrics || [],
          durationDays: s.durationDays || 30,
          status: "pending" as const,
        }));
        setTasks(mapped);
      })
      .catch(() => setTasks([]))
      .finally(() => setLoading(false));
  }, [status, stellarAddress]);

  const toggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSources.length === 0) {
      setRegError("Select at least one data source");
      return;
    }
    if (!openclawUrl) {
      setRegError("OpenClaw URL is required for task delivery");
      return;
    }
    setRegistering(true);
    setRegError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      const res = await fetch(`${apiUrl}/api/provider/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stellarAddress,
          dataSources: selectedSources,
          openclawUrl,
          channel,
          contactInfo: openclawToken || "pending",
          policy,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Server error: ${res.status}`);
      }

      if (openclawToken) {
        await fetch(`${apiUrl}/api/provider/bot-config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stellarAddress,
            openclawUrl,
            openclawToken,
          }),
        }).catch(() => {});
      }

      setProvider({ registered: true, dataSources: selectedSources, policy });
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  const handleSavePolicy = async () => {
    if (!stellarAddress || !provider?.registered) return;
    setPolicySaving(true);
    setPolicySaved(false);
    try {
      await apiFetch("/api/provider/policy", {
        method: "POST",
        body: JSON.stringify({
          stellarAddress,
          policy,
        }),
      });
      setPolicySaved(true);
      setTimeout(() => setPolicySaved(false), 2500);
      setProvider((prev) => (prev ? { ...prev, policy } : prev));
    } catch {
      // silent UI fallback
    } finally {
      setPolicySaving(false);
    }
  };

  const handleDecision = async (skillId: string, decision: "ACCEPT" | "REJECT") => {
    if (!session?.user?.pseudoId || !stellarAddress) return;
    setActionLoading(skillId);

    try {
      let txHash: string | undefined;
      let publicKey: string | undefined;

      if (decision === "ACCEPT") {
        // Sign and submit consent TX on Stellar via Freighter
        const hash = await freighter.signAndSubmitConsentTx(
          skillId,
          session.user.pseudoId,
          stellarAddress,
          "ACCEPT"
        );

        if (!hash) {
          // User cancelled or Freighter error
          setActionLoading(null);
          return;
        }

        txHash = hash;
        publicKey = stellarAddress;
      }

      await apiFetch("/api/consent/record", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          pseudoId: session.user.pseudoId,
          decision,
          ...(txHash ? { txHash, publicKey } : {}),
        }),
      });

      setTasks((prev) =>
        prev.map((t) =>
          t.skillId === skillId
            ? { ...t, status: decision === "ACCEPT" ? "accepted" : "rejected" }
            : t
        )
      );
    } catch (err) {
      console.error("[sell] consent decision failed:", err);
    } finally {
      setActionLoading(null);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-900" />
          <div className="h-40 rounded-lg bg-slate-900" />
        </div>
      </div>
    );
  }

  const effectivePolicy = provider?.policy || policy;
  const matchesPolicy = (task: Task) => {
    const rewardOk = task.rewardPerUser >= effectivePolicy.minRewardPerUserUsdc;
    const durationOk = task.durationDays <= effectivePolicy.maxProgramDurationDays;
    const witnessOk = (task.policy?.minWitnessCount ?? 1) >= effectivePolicy.minWitnessCount;
    const proofAgeOk = (task.policy?.maxProofAgeHours ?? 24) <= effectivePolicy.maxProofAgeHours;
    const callbackOk =
      !effectivePolicy.requireHttpsBuyerCallback ||
      !task.callbackUrl ||
      task.callbackUrl.startsWith("https://");
    return rewardOk && durationOk && witnessOk && proofAgeOk && callbackOk;
  };

  const providerSources = provider?.dataSources || selectedSources;
  const allPending = tasks.filter((t) => {
    if (t.status !== "pending") return false;
    // Filter by provider's supported data sources
    if (providerSources.length > 0 && !providerSources.includes(t.dataSource)) return false;
    return true;
  });
  const pending = allPending.filter(matchesPolicy);
  const blockedByPolicy = allPending.length - pending.length;
  const active = tasks
    .filter((t) => t.status === "accepted" || t.status === "completed")
    .slice(0, effectivePolicy.maxActivePrograms);

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <div>
        <span className="flow-badge">Sell Data</span>
        <h1 className="mt-3 text-3xl font-bold text-slate-100">Data Seller Dashboard</h1>
        <p className="mt-2 text-sm text-slate-400">
          Configure who can buy your data and under which constraints. Your policy is applied before consent and proof execution.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-slate-500">Pending Consent</p>
          <p className="text-2xl font-bold text-slate-100">{pending.length}</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-slate-500">Active Programs</p>
          <p className="text-2xl font-bold text-emerald-300">{active.length}</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-slate-500">Supported Sources</p>
          <p className="text-2xl font-bold text-slate-100">
            {provider?.dataSources?.length ?? selectedSources.length}
          </p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-slate-500">Provider Status</p>
          <p className="text-2xl font-bold text-slate-100">{provider?.registered ? "Active" : "Setup"}</p>
        </div>
      </div>

      {!provider?.registered ? (
        <div className="flow-surface rounded-xl p-6">
          <h2 className="mb-2 text-lg font-semibold text-slate-100">Seller Onboarding</h2>
          <p className="mb-5 text-sm text-slate-400">
            Select the sources you control, configure OpenClaw, and set your sale policy before receiving requests.
          </p>

          <form onSubmit={handleRegister} className="space-y-5">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
                Data Sources
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {API_SOURCES.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    onClick={() => toggleSource(source.id)}
                    className={`flow-chip ${selectedSources.includes(source.id) ? "selected" : ""}`}
                  >
                    {source.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-800 pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
                Sale Policy
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="flow-label-sm">Min Reward (USDC/epoch)</label>
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    value={policy.minRewardPerUserUsdc}
                    onChange={(e) =>
                      setPolicy((prev) => ({ ...prev, minRewardPerUserUsdc: Number(e.target.value) }))
                    }
                    className="flow-input"
                  />
                </div>
                <div>
                  <label className="flow-label-sm">Max Program Duration (days)</label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={policy.maxProgramDurationDays}
                    onChange={(e) =>
                      setPolicy((prev) => ({ ...prev, maxProgramDurationDays: Number(e.target.value) }))
                    }
                    className="flow-input"
                  />
                </div>
                <div>
                  <label className="flow-label-sm">Max Proof Age (hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={policy.maxProofAgeHours}
                    onChange={(e) =>
                      setPolicy((prev) => ({ ...prev, maxProofAgeHours: Number(e.target.value) }))
                    }
                    className="flow-input"
                  />
                </div>
                <div>
                  <label className="flow-label-sm">Min Witness Count</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={policy.minWitnessCount}
                    onChange={(e) =>
                      setPolicy((prev) => ({ ...prev, minWitnessCount: Number(e.target.value) }))
                    }
                    className="flow-input"
                  />
                </div>
                <div>
                  <label className="flow-label-sm">Max Active Programs</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={policy.maxActivePrograms}
                    onChange={(e) =>
                      setPolicy((prev) => ({ ...prev, maxActivePrograms: Number(e.target.value) }))
                    }
                    className="flow-input"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={policy.requireHttpsBuyerCallback}
                    onChange={(e) =>
                      setPolicy((prev) => ({ ...prev, requireHttpsBuyerCallback: e.target.checked }))
                    }
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                  />
                  Require HTTPS buyer callback
                </label>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-5">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
                OpenClaw Bot Configuration
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="flow-label-sm">Bot URL</label>
                  <input
                    type="url"
                    value={openclawUrl}
                    onChange={(e) => setOpenclawUrl(e.target.value)}
                    placeholder="https://your-openclaw-instance.com"
                    className="flow-input"
                    required
                  />
                </div>
                <div>
                  <label className="flow-label-sm">API Token</label>
                  <input
                    type="password"
                    value={openclawToken}
                    onChange={(e) => setOpenclawToken(e.target.value)}
                    placeholder="Bearer token for /hooks/agent"
                    className="flow-input"
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="flow-label-sm">Notification Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as typeof channel)}
                  className="flow-input"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="discord">Discord</option>
                </select>
              </div>
            </div>

            {regError && <div className="flow-error">{regError}</div>}

            <Button
              type="submit"
              variant="primary"
              isLoading={registering}
              disabled={registering || selectedSources.length === 0}
              className="w-full"
            >
              Activate Seller Profile
            </Button>
          </form>
        </div>
      ) : (
        <div className="flow-surface rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-300">Provider Active</p>
              <p className="mt-1 text-xs text-slate-400">
                Sources: {provider.dataSources?.join(", ") || "All sources"}
              </p>
            </div>
            <span className="flow-status-badge active">Active</span>
          </div>
          <div className="mt-4 border-t border-slate-800 pt-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Sale Policy
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className="flow-label-sm">Min Reward (USDC/epoch)</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={policy.minRewardPerUserUsdc}
                  onChange={(e) =>
                    setPolicy((prev) => ({ ...prev, minRewardPerUserUsdc: Number(e.target.value) }))
                  }
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Max Program Duration (days)</label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={policy.maxProgramDurationDays}
                  onChange={(e) =>
                    setPolicy((prev) => ({ ...prev, maxProgramDurationDays: Number(e.target.value) }))
                  }
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Max Proof Age (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={policy.maxProofAgeHours}
                  onChange={(e) =>
                    setPolicy((prev) => ({ ...prev, maxProofAgeHours: Number(e.target.value) }))
                  }
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Min Witness Count</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={policy.minWitnessCount}
                  onChange={(e) =>
                    setPolicy((prev) => ({ ...prev, minWitnessCount: Number(e.target.value) }))
                  }
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Max Active Programs</label>
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={policy.maxActivePrograms}
                  onChange={(e) =>
                    setPolicy((prev) => ({ ...prev, maxActivePrograms: Number(e.target.value) }))
                  }
                  className="flow-input"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={policy.requireHttpsBuyerCallback}
                  onChange={(e) =>
                    setPolicy((prev) => ({ ...prev, requireHttpsBuyerCallback: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                />
                Require HTTPS buyer callback
              </label>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                size="sm"
                variant="primary"
                onClick={handleSavePolicy}
                disabled={policySaving}
                isLoading={policySaving}
              >
                Save Policy
              </Button>
              {policySaved && <span className="text-xs text-emerald-300">Policy saved.</span>}
            </div>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-100">
            Pending Consent ({pending.length})
          </h2>
          {blockedByPolicy > 0 && (
            <p className="mb-3 text-xs text-slate-500">
              {blockedByPolicy} request(s) hidden by your policy constraints.
            </p>
          )}
          <div className="space-y-3">
            {pending.map((task) => (
              <div key={task.skillId} className="flow-surface rounded-xl p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-100">{task.title}</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {task.dataSource} | {task.metrics.slice(0, 3).join(", ")} |{" "}
                      <span className="font-medium text-emerald-300">{task.rewardPerUser} USDC/epoch</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pipeline: consent → proof → escrow release
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
                      Grant Consent
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={actionLoading !== null}
                      onClick={() => handleDecision(task.skillId, "REJECT")}
                    >
                      Decline
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-slate-100">Running Programs ({active.length})</h2>
          <div className="space-y-3">
            {active.map((task) => (
              <div key={task.skillId} className="flow-surface rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-100">{task.title}</h3>
                    <p className="mt-1 text-xs text-slate-400">
                      {task.dataSource} | {task.rewardPerUser} USDC/epoch | proof pipeline active
                    </p>
                  </div>
                  <span className="flow-status-badge active">Active</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tasks.length === 0 && provider?.registered && (
        <div className="flow-surface rounded-xl py-12 text-center text-slate-400">
          <p className="text-sm">No active programs yet. New data requests will appear here when available.</p>
        </div>
      )}
    </div>
  );
}
