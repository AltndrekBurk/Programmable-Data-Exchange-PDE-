"use client";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadJsonToIpfs } from "@/lib/ipfs";
import { buildIndexKey, buildManageDataTx, signAndSubmitTx } from "@/lib/stellar";
import { readActiveSkills, getPlatformAddress, type SkillData } from "@/lib/chain-reader";
import { fetchFromIpfs } from "@/lib/ipfs";
import Button from "@/components/ui/Button";
import { useFreighter } from "@/hooks/useFreighter";

/* ─── Verification method options ─── */
type VerificationMethod = "api-zktls" | "device-tee" | "fhe-range" | "zk-selective";

const VERIFICATION_METHODS: {
  id: VerificationMethod;
  label: string;
  desc: string;
  enabled: boolean;
}[] = [
  {
    id: "api-zktls",
    label: "API (zkTLS)",
    desc: "Verify data from any web API using zero-knowledge TLS proofs. Works with any REST/GraphQL endpoint.",
    enabled: true,
  },
  {
    id: "device-tee",
    label: "Device (TEE)",
    desc: "Verify data directly from device sensors using Trusted Execution Environment attestation.",
    enabled: false,
  },
  {
    id: "fhe-range",
    label: "FHE (Range Query)",
    desc: "Answer range queries (e.g. age 25-35?) without revealing exact values using Fully Homomorphic Encryption.",
    enabled: false,
  },
  {
    id: "zk-selective",
    label: "ZK Selective Disclosure",
    desc: "Reveal only specific fields from your data while keeping the rest private with ZK proofs.",
    enabled: false,
  },
];

/* ─── Data timing options ─── */
type DataTimingMode = "realtime" | "historical" | "periodic";

const TIMING_OPTIONS: { id: DataTimingMode; label: string; desc: string }[] = [
  { id: "realtime", label: "Real-time", desc: "Fresh data fetched at the moment of request" },
  { id: "historical", label: "Historical", desc: "Data from a specific date range in the past" },
  { id: "periodic", label: "Periodic", desc: "Recurring data collection at regular intervals" },
];

/* ─── Types ─── */
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

interface ProviderPolicy {
  verificationMethod: VerificationMethod;
  dataSources: string[];
  dataTimingMode: DataTimingMode;
  historicalStartDate?: string;
  historicalEndDate?: string;
  periodicInterval?: string;
  periodicFrequencyLabel?: string;
  minRewardPerUserUsdc: number;
  maxProgramDurationDays: number;
  maxProofAgeHours: number;
  minWitnessCount: number;
  requireHttpsBuyerCallback: boolean;
  maxActivePrograms: number;
  policyCid?: string;
  policyDescription?: string;
}

interface ProviderInfo {
  registered: boolean;
  dataSources?: string[];
  stellarAddress?: string;
  policy?: ProviderPolicy;
}

const DEFAULT_POLICY: ProviderPolicy = {
  verificationMethod: "api-zktls",
  dataSources: [],
  dataTimingMode: "realtime",
  minRewardPerUserUsdc: 0.5,
  maxProgramDurationDays: 90,
  maxProofAgeHours: 24,
  minWitnessCount: 1,
  requireHttpsBuyerCallback: true,
  maxActivePrograms: 10,
  policyDescription: "",
};

/* ─── Component ─── */
export default function SellDataPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [openclawUrl, setOpenclawUrl] = useState("");
  const [openclawToken, setOpenclawToken] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "telegram" | "discord">("whatsapp");
  const [registering, setRegistering] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<ProviderPolicy>(DEFAULT_POLICY);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);

  /* data source input */
  const [sourceInput, setSourceInput] = useState("");

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

    const addr = (session?.user as { stellarAddress?: string })?.stellarAddress;

    // Chain-first: read provider data from Stellar + IPFS
    const loadProvider = async () => {
      try {
        const platformAddr = getPlatformAddress();
        if (!platformAddr || !addr) return;
        const { readAccountData, PREFIXES } = await import("@/lib/stellar");
        const accountData = await readAccountData(platformAddr);
        const providerKey = `${PREFIXES.provider}${addr.slice(0, 24)}`;
        const cid = accountData.get(providerKey);
        if (cid) {
          const data = await fetchFromIpfs<Record<string, unknown>>(cid);
          setProvider({ registered: true, ...data });
          if (data?.policy && typeof data.policy === "object") {
            const p = data.policy as Record<string, unknown>;
            setPolicy((prev) => ({
              ...prev,
              ...p,
              dataSources: Array.isArray(p.dataSources)
                ? p.dataSources
                : Array.isArray(data.dataSources)
                  ? (data.dataSources as string[])
                  : [],
            }));
          } else if (Array.isArray(data?.dataSources) && (data.dataSources as string[]).length > 0) {
            setPolicy((prev) => ({ ...prev, dataSources: data.dataSources as string[] }));
          }
        } else {
          setProvider({ registered: false });
        }
      } catch {
        setProvider({ registered: false });
      }
    };

    // Chain-first: read skills from Stellar + IPFS
    const loadSkills = async () => {
      try {
        const chainSkills = await readActiveSkills();
        const mapped = chainSkills
          .filter((s) => s.data)
          .map((s) => {
            const d = s.data as SkillData;
            return {
              id: d.id || crypto.randomUUID(),
              skillId: d.id || crypto.randomUUID(),
              title: d.title || "On-chain skill",
              dataSource: d.dataSource || "unknown",
              metrics: d.metrics || [],
              rewardPerUser: Number(d.rewardPerUser || 0),
              durationDays: Number(d.durationDays || 30),
              status: "pending" as const,
              expiresAt: d.createdAt
                ? new Date(new Date(d.createdAt).getTime() + (d.durationDays || 30) * 86400000).toISOString()
                : new Date(Date.now() + 7 * 86400000).toISOString(),
            };
          });
        setTasks(mapped);
      } catch {
        setTasks([]);
      }
    };

    Promise.all([loadProvider(), loadSkills()])
      .finally(() => setLoading(false));
  }, [status, stellarAddress, session]);

  /* ── Data source management ── */
  const addSource = () => {
    const trimmed = sourceInput.trim();
    if (!trimmed) return;
    if (policy.dataSources.includes(trimmed.toLowerCase())) {
      setSourceInput("");
      return;
    }
    setPolicy((prev) => ({
      ...prev,
      dataSources: [...prev.dataSources, trimmed],
    }));
    setSourceInput("");
  };

  const removeSource = (source: string) => {
    setPolicy((prev) => ({
      ...prev,
      dataSources: prev.dataSources.filter((s) => s !== source),
    }));
  };

  const handleSourceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSource();
    }
  };

  /* ── Register ── */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (policy.dataSources.length === 0) {
      setRegError("Add at least one data source");
      return;
    }
    if (!openclawUrl) {
      setRegError("OpenClaw URL is required for task delivery");
      return;
    }
    setRegistering(true);
    setRegError(null);

    try {
      if (!stellarAddress) {
        setRegError("Wallet not connected");
        return;
      }

      const supportedDataDescription = `${policy.verificationMethod} | ${policy.dataSources.join(", ")}`;

      // Step 1: Upload provider policy to IPFS (client-side)
      const providerData = {
        stellarAddress,
        dataSources: policy.dataSources,
        supportedDataDescription,
        policy,
        openclawUrl,
        channel,
        registeredAt: new Date().toISOString(),
      };

      const ipfsHash = await uploadJsonToIpfs(providerData, {
        name: `provider-${stellarAddress.slice(0, 8)}.json`,
        keyvalues: { type: "provider" },
      });

      // Step 2: Write index to Stellar via Freighter
      // Use stellarAddress as a short ID for the key
      const shortId = stellarAddress.slice(0, 24);
      const indexKey = `pr:${shortId}`;
      const xdr = await buildManageDataTx(stellarAddress, indexKey, ipfsHash);
      const txHash = await signAndSubmitTx(xdr);

      // Step 3: Notify backend (facilitator awareness)
      await apiFetch("/api/notify/provider", {
        method: "POST",
        body: JSON.stringify({
          stellarAddress,
          ipfsHash,
          txHash,
          dataSources: policy.dataSources,
          supportedDataDescription,
          openclawUrl: openclawUrl || undefined,
          channel,
          contactInfo: openclawToken || "pending",
          policy,
        }),
      }).catch((err) => console.warn("[sell] Backend notify failed:", err));

      // Step 4: Bot config (still backend-only, has sensitive token)
      if (openclawToken) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
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

      setProvider({ registered: true, dataSources: policy.dataSources, policy });
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setRegistering(false);
    }
  };

  /* ── Save Policy → IPFS → Chain ── */
  const handleSavePolicy = async () => {
    if (!stellarAddress || !provider?.registered) return;
    setPolicySaving(true);
    setPolicySaved(false);
    try {
      // Step 1: Upload policy to IPFS (client-side)
      const policyData = {
        ...policy,
        stellarAddress,
        updatedAt: new Date().toISOString(),
      };

      const policyCid = await uploadJsonToIpfs(policyData, {
        name: `policy-${stellarAddress.slice(0, 8)}.json`,
        keyvalues: { type: "policy" },
      });

      // Step 2: Write to Stellar via Freighter
      const shortId = stellarAddress.slice(0, 24);
      const indexKey = `pr:${shortId}`;
      const xdr = await buildManageDataTx(stellarAddress, indexKey, policyCid);
      const txHash = await signAndSubmitTx(xdr);

      // Step 3: Notify backend
      await apiFetch("/api/notify/policy", {
        method: "POST",
        body: JSON.stringify({
          stellarAddress,
          ipfsHash: policyCid,
          txHash,
          policy: policyData,
        }),
      }).catch((err) => console.warn("[sell] Policy notify failed:", err));

      const updatedPolicy = { ...policy, policyCid };
      setPolicy(updatedPolicy);
      setPolicySaved(true);
      setTimeout(() => setPolicySaved(false), 3000);
      setProvider((prev) => (prev ? { ...prev, policy: updatedPolicy, dataSources: policy.dataSources } : prev));
    } catch {
      // silent UI fallback
    } finally {
      setPolicySaving(false);
    }
  };

  /* ── Consent decision ── */
  const handleDecision = async (skillId: string, decision: "ACCEPT" | "REJECT") => {
    if (!session?.user?.stellarAddress || !stellarAddress) return;
    setActionLoading(skillId);

    try {
      let txHash: string | undefined;

      if (decision === "ACCEPT") {
        const hash = await freighter.signAndSubmitConsentTx(
          skillId,
          session.user.stellarAddress,
          stellarAddress,
          "ACCEPT"
        );
        if (!hash) {
          setActionLoading(null);
          return;
        }
        txHash = hash;
      }

      await apiFetch("/api/consent/record", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          stellarAddress: session.user.stellarAddress,
          decision,
          ...(txHash ? { txHash, publicKey: stellarAddress } : {}),
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

  /* ── Loading state ── */
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

  /* ── Policy matching ── */
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

  const providerSources = provider?.dataSources || policy.dataSources;
  const allPending = tasks.filter((t) => {
    if (t.status !== "pending") return false;
    if (providerSources.length > 0 && !providerSources.includes(t.dataSource)) return false;
    return true;
  });
  const pending = allPending.filter(matchesPolicy);
  const blockedByPolicy = allPending.length - pending.length;
  const active = tasks
    .filter((t) => t.status === "accepted" || t.status === "completed")
    .slice(0, effectivePolicy.maxActivePrograms);

  /* ── Shared Policy Form ── */
  const PolicyForm = () => (
    <div className="space-y-6">
      {/* ── Verification Method ── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
          Verification Method
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {VERIFICATION_METHODS.map((vm) => (
            <button
              key={vm.id}
              type="button"
              disabled={!vm.enabled}
              onClick={() =>
                vm.enabled && setPolicy((prev) => ({ ...prev, verificationMethod: vm.id }))
              }
              className={`relative rounded-lg border p-4 text-left transition-all ${
                !vm.enabled
                  ? "cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50"
                  : policy.verificationMethod === vm.id
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
              }`}
            >
              <p className="text-sm font-semibold text-slate-100">{vm.label}</p>
              <p className="mt-1 text-xs text-slate-400">{vm.desc}</p>
              {!vm.enabled && (
                <span className="absolute right-3 top-3 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                  Coming Soon
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Data Sources (free-form input) ── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-1">
          Data Sources
        </h3>
        <p className="mb-3 text-xs text-slate-500">
          Type any API or data source you can provide. No restrictions — zkTLS will verify authenticity.
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={sourceInput}
            onChange={(e) => setSourceInput(e.target.value)}
            onKeyDown={handleSourceKeyDown}
            placeholder="e.g. Fitbit, Strava, Twitter API, Bank XYZ, Custom REST endpoint..."
            className="flow-input flex-1"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={addSource}
            disabled={!sourceInput.trim()}
          >
            Add
          </Button>
        </div>
        {policy.dataSources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {policy.dataSources.map((source) => (
              <span
                key={source}
                className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300"
              >
                {source}
                <button
                  type="button"
                  onClick={() => removeSource(source)}
                  className="ml-0.5 text-emerald-300/60 hover:text-red-400 transition-colors"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── Data Timing ── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
          Data Timing
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TIMING_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setPolicy((prev) => ({ ...prev, dataTimingMode: opt.id }))}
              className={`rounded-lg border p-3 text-left transition-all ${
                policy.dataTimingMode === opt.id
                  ? "border-emerald-500 bg-emerald-500/10"
                  : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
              }`}
            >
              <p className="text-sm font-semibold text-slate-100">{opt.label}</p>
              <p className="mt-1 text-xs text-slate-400">{opt.desc}</p>
            </button>
          ))}
        </div>

        {/* Historical date range */}
        {policy.dataTimingMode === "historical" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="flow-label-sm">Start Date</label>
              <input
                type="date"
                value={policy.historicalStartDate || ""}
                onChange={(e) =>
                  setPolicy((prev) => ({ ...prev, historicalStartDate: e.target.value }))
                }
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label-sm">End Date</label>
              <input
                type="date"
                value={policy.historicalEndDate || ""}
                onChange={(e) =>
                  setPolicy((prev) => ({ ...prev, historicalEndDate: e.target.value }))
                }
                className="flow-input"
              />
            </div>
          </div>
        )}

        {/* Periodic frequency */}
        {policy.dataTimingMode === "periodic" && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label className="flow-label-sm">Frequency</label>
              <select
                value={policy.periodicFrequencyLabel || "daily"}
                onChange={(e) =>
                  setPolicy((prev) => ({
                    ...prev,
                    periodicFrequencyLabel: e.target.value,
                    periodicInterval: e.target.value,
                  }))
                }
                className="flow-input"
              >
                <option value="every-6h">Every 6 hours</option>
                <option value="every-12h">Every 12 hours</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="flow-label-sm">Custom Interval (optional)</label>
              <input
                type="text"
                value={policy.periodicInterval || ""}
                onChange={(e) =>
                  setPolicy((prev) => ({ ...prev, periodicInterval: e.target.value }))
                }
                placeholder="e.g. every 3 days, twice per week..."
                className="flow-input"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Policy Description ── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-1">
          Policy Description
        </h3>
        <p className="mb-2 text-xs text-slate-500">
          Describe your data offering, conditions, and any special requirements. This will be public on-chain via IPFS.
        </p>
        <textarea
          value={policy.policyDescription || ""}
          onChange={(e) => setPolicy((prev) => ({ ...prev, policyDescription: e.target.value }))}
          placeholder="e.g. I provide daily Fitbit health metrics (steps, heart rate, sleep). Data available from Jan 2024. Only for research purposes..."
          rows={3}
          className="flow-input resize-none"
        />
      </div>

      {/* ── Constraints ── */}
      <div>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
          Constraints
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

      {/* Policy CID badge */}
      {policy.policyCid && (
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs text-slate-400">
          Policy on IPFS:{" "}
          <span className="font-mono text-emerald-300">{policy.policyCid}</span>
        </div>
      )}
    </div>
  );

  /* ─── Render ─── */
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      <div>
        <span className="flow-badge">Sell Data</span>
        <h1 className="mt-3 text-3xl font-bold text-slate-100">Data Seller Dashboard</h1>
        <p className="mt-2 text-sm text-slate-400">
          Configure your data sources and sale policy. Your policy is uploaded to IPFS and registered on-chain — publicly verifiable by any buyer.
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
          <p className="text-slate-500">Data Sources</p>
          <p className="text-2xl font-bold text-slate-100">
            {provider?.dataSources?.length ?? policy.dataSources.length}
          </p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-slate-500">Provider Status</p>
          <p className="text-2xl font-bold text-slate-100">
            {provider?.registered ? "Active" : "Setup"}
          </p>
        </div>
      </div>

      {!provider?.registered ? (
        <div className="flow-surface rounded-xl p-6">
          <h2 className="mb-2 text-lg font-semibold text-slate-100">Seller Onboarding</h2>
          <p className="mb-5 text-sm text-slate-400">
            Define what data you can provide, set your verification method and sale policy, then configure OpenClaw for task delivery.
          </p>

          <form onSubmit={handleRegister} className="space-y-6">
            <PolicyForm />

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
              disabled={registering || policy.dataSources.length === 0}
              className="w-full"
            >
              Activate Seller Profile
            </Button>
          </form>
        </div>
      ) : (
        <div className="flow-surface rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-emerald-300">Provider Active</p>
              <p className="mt-1 text-xs text-slate-400">
                Sources: {provider.dataSources?.join(", ") || policy.dataSources.join(", ") || "Not configured"}
              </p>
            </div>
            <span className="flow-status-badge active">Active</span>
          </div>
          <div className="border-t border-slate-800 pt-4">
            <PolicyForm />
            <div className="mt-4 flex items-center gap-3">
              <Button
                size="sm"
                variant="primary"
                onClick={handleSavePolicy}
                disabled={policySaving}
                isLoading={policySaving}
              >
                Save Policy to IPFS
              </Button>
              {policySaved && (
                <span className="text-xs text-emerald-300">
                  Policy saved & uploaded to IPFS
                </span>
              )}
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
                      <span className="font-medium text-emerald-300">
                        {task.rewardPerUser} USDC/epoch
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Pipeline: consent &rarr; proof &rarr; escrow release
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
          <h2 className="mb-3 text-lg font-semibold text-slate-100">
            Running Programs ({active.length})
          </h2>
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
          <p className="text-sm">
            No active programs yet. New data requests will appear here when available.
          </p>
        </div>
      )}
    </div>
  );
}
