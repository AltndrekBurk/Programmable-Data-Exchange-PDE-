"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { uploadJsonToIpfs, fetchFromIpfs } from "@/lib/ipfs";
import { buildManageDataTx, signAndSubmitTx, readAccountData, PREFIXES } from "@/lib/stellar";
import { getPlatformAddress } from "@/lib/chain-reader";

/* ── Types ── */
interface SellerPolicy {
  dataSources: string[];
  allowedMetrics: string[];
  deniedMetrics: string[];
  minPricePerRequest: number;
  maxRowsPerRequest: number;
  maxConcurrentTasks: number;
  autoAccept: boolean;
  autoAcceptMaxPrice: number;
  autoAcceptOnlyMetrics: string[];
  contactChannel: "whatsapp" | "telegram" | "discord";
  contactId: string;
  attestorUrl: string;
  policyDescription: string;
}

interface ExistingPolicy extends SellerPolicy {
  stellarAddress?: string;
  policyCid?: string;
  updatedAt?: string;
}

const DEFAULT_POLICY: SellerPolicy = {
  dataSources: [],
  allowedMetrics: [],
  deniedMetrics: [],
  minPricePerRequest: 0.5,
  maxRowsPerRequest: 500,
  maxConcurrentTasks: 5,
  autoAccept: false,
  autoAcceptMaxPrice: 10,
  autoAcceptOnlyMetrics: [],
  contactChannel: "whatsapp",
  contactId: "",
  attestorUrl: "",
  policyDescription: "",
};

/* ── Tag Input Component ── */
function TagInput({
  label,
  hint,
  placeholder,
  tags,
  onAdd,
  onRemove,
  tagColor = "emerald",
}: {
  label: string;
  hint?: string;
  placeholder: string;
  tags: string[];
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  tagColor?: "emerald" | "red" | "cyan";
}) {
  const [input, setInput] = useState("");

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const trimmed = input.trim().replace(/,$/g, "");
      if (trimmed && !tags.includes(trimmed.toLowerCase())) {
        onAdd(trimmed.toLowerCase());
      }
      setInput("");
    }
  };

  const handleAdd = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed.toLowerCase())) {
      onAdd(trimmed.toLowerCase());
    }
    setInput("");
  };

  const colorMap = {
    emerald: {
      border: "border-emerald-500/30",
      bg: "bg-emerald-500/10",
      text: "text-emerald-300",
      hoverX: "hover:text-red-400",
    },
    red: {
      border: "border-red-500/30",
      bg: "bg-red-500/10",
      text: "text-red-300",
      hoverX: "hover:text-red-200",
    },
    cyan: {
      border: "border-cyan-500/30",
      bg: "bg-cyan-500/10",
      text: "text-cyan-300",
      hoverX: "hover:text-red-400",
    },
  };

  const c = colorMap[tagColor];

  return (
    <div>
      <label className="flow-label-sm">{label}</label>
      {hint && <p className="mb-2 text-xs text-slate-500">{hint}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flow-input flex-1"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={!input.trim()}
        >
          Add
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center gap-1.5 rounded-full border ${c.border} ${c.bg} px-3 py-1 text-xs font-medium ${c.text}`}
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className={`ml-0.5 ${c.text}/60 ${c.hoverX} transition-colors`}
              >
                x
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Component ── */
export default function SellerPolicyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [policy, setPolicy] = useState<SellerPolicy>(DEFAULT_POLICY);
  const [existingPolicy, setExistingPolicy] = useState<ExistingPolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedCid, setSavedCid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  /* ── Load existing policy from chain ── */
  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    const loadExisting = async () => {
      try {
        const platformAddr = getPlatformAddress();
        if (!platformAddr) {
          setLoading(false);
          return;
        }

        const accountData = await readAccountData(platformAddr);
        const providerKey = `${PREFIXES.provider}${stellarAddress.slice(0, 24)}`;
        const cid = accountData.get(providerKey);

        if (cid) {
          const data = await fetchFromIpfs<Record<string, unknown>>(cid);
          if (data) {
            const p = (data.policy as Record<string, unknown>) || data;
            const existing: ExistingPolicy = {
              dataSources: Array.isArray(p.dataSources) ? p.dataSources as string[] : [],
              allowedMetrics: Array.isArray(p.allowedMetrics) ? p.allowedMetrics as string[] : [],
              deniedMetrics: Array.isArray(p.deniedMetrics) ? p.deniedMetrics as string[] : [],
              minPricePerRequest: Number(p.minPricePerRequest ?? p.minRewardPerUserUsdc ?? 0.5),
              maxRowsPerRequest: Number(p.maxRowsPerRequest ?? 500),
              maxConcurrentTasks: Number(p.maxConcurrentTasks ?? p.maxActivePrograms ?? 5),
              autoAccept: Boolean(p.autoAccept),
              autoAcceptMaxPrice: Number(p.autoAcceptMaxPrice ?? 10),
              autoAcceptOnlyMetrics: Array.isArray(p.autoAcceptOnlyMetrics) ? p.autoAcceptOnlyMetrics as string[] : [],
              contactChannel: (p.contactChannel as SellerPolicy["contactChannel"]) || (data.channel as SellerPolicy["contactChannel"]) || "whatsapp",
              contactId: String(p.contactId || data.contactInfo || ""),
              attestorUrl: String(p.attestorUrl || ""),
              policyDescription: String(p.policyDescription || ""),
              stellarAddress: data.stellarAddress as string,
              policyCid: cid,
              updatedAt: data.updatedAt as string,
            };

            setExistingPolicy(existing);
            setPolicy(existing);
          }
        }
      } catch (err) {
        console.error("[seller-policy] load failed:", err);
      } finally {
        setLoading(false);
      }
    };

    loadExisting();
  }, [status, stellarAddress]);

  /* ── Tag handlers ── */
  const addTag = useCallback(
    (field: keyof Pick<SellerPolicy, "dataSources" | "allowedMetrics" | "deniedMetrics" | "autoAcceptOnlyMetrics">, tag: string) => {
      setPolicy((prev) => ({
        ...prev,
        [field]: [...prev[field], tag],
      }));
    },
    []
  );

  const removeTag = useCallback(
    (field: keyof Pick<SellerPolicy, "dataSources" | "allowedMetrics" | "deniedMetrics" | "autoAcceptOnlyMetrics">, tag: string) => {
      setPolicy((prev) => ({
        ...prev,
        [field]: prev[field].filter((t) => t !== tag),
      }));
    },
    []
  );

  /* ── Save Policy ── */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (policy.dataSources.length === 0) {
      setError("Add at least one data source.");
      return;
    }
    if (!stellarAddress) {
      setError("Wallet not connected.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    setSavedCid(null);

    try {
      // Step 1: Build policy JSON
      const policyData = {
        ...policy,
        stellarAddress,
        updatedAt: new Date().toISOString(),
      };

      // Step 2: Upload to IPFS
      const policyCid = await uploadJsonToIpfs(policyData, {
        name: `seller-policy-${stellarAddress.slice(0, 8)}.json`,
        keyvalues: { type: "seller-policy" },
      });

      // Step 3: Index on Stellar (pr: prefix)
      const shortId = stellarAddress.slice(0, 24);
      const indexKey = `${PREFIXES.provider}${shortId}`;
      const xdr = await buildManageDataTx(stellarAddress, indexKey, policyCid);
      const txHash = await signAndSubmitTx(xdr);

      // Step 4: Notify backend (fire-and-forget)
      apiFetch("/api/notify/policy", {
        method: "POST",
        body: JSON.stringify({
          stellarAddress,
          ipfsHash: policyCid,
          txHash,
          policy: policyData,
        }),
      }).catch((err) => console.warn("[seller-policy] notify failed:", err));

      // Step 5: Success
      setSavedCid(policyCid);
      setSaved(true);
      setExistingPolicy({ ...policy, stellarAddress, policyCid, updatedAt: policyData.updatedAt });
      setTimeout(() => setSaved(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  /* ── Loading ── */
  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-900" />
          <div className="h-4 w-80 rounded bg-slate-900" />
          <div className="h-96 rounded-lg bg-slate-900" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {/* ── Header ── */}
      <div>
        <span className="flow-badge">Seller Policy</span>
        <h1 className="mt-3 text-3xl font-bold text-slate-100">Policy Configuration</h1>
        <p className="mt-2 text-sm text-slate-400">
          Define your data offering, pricing, and constraints. Your policy is uploaded to IPFS and indexed on Stellar -- publicly verifiable.
        </p>
      </div>

      {/* ── Current Policy ── */}
      {existingPolicy?.policyCid && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-300">Current Policy On-chain</p>
              <p className="mt-1 text-xs text-slate-400">
                CID: <span className="font-mono text-emerald-300">{existingPolicy.policyCid}</span>
              </p>
              {existingPolicy.updatedAt && (
                <p className="mt-0.5 text-[10px] text-slate-500">
                  Last updated: {new Date(existingPolicy.updatedAt).toLocaleString()}
                </p>
              )}
            </div>
            <span className="flow-status-badge active">Active</span>
          </div>
        </div>
      )}

      {/* ── Form ── */}
      <form onSubmit={handleSave} className="space-y-6">
        {/* Data Sources */}
        <div className="flow-surface rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Data Offering
          </h2>

          <TagInput
            label="Data Sources"
            hint="Type a data source name and press Enter. E.g., fitbit, strava, spotify, bank_xyz."
            placeholder="e.g. fitbit, strava, spotify..."
            tags={policy.dataSources}
            onAdd={(tag) => addTag("dataSources", tag)}
            onRemove={(tag) => removeTag("dataSources", tag)}
            tagColor="emerald"
          />

          <TagInput
            label="Allowed Metrics"
            hint="Metrics you are willing to provide. Leave empty to allow all."
            placeholder="e.g. steps, distance, top_tracks..."
            tags={policy.allowedMetrics}
            onAdd={(tag) => addTag("allowedMetrics", tag)}
            onRemove={(tag) => removeTag("allowedMetrics", tag)}
            tagColor="cyan"
          />

          <TagInput
            label="Denied Metrics"
            hint="Metrics you will never provide, regardless of task requirements."
            placeholder="e.g. heart_rate, sleep, location..."
            tags={policy.deniedMetrics}
            onAdd={(tag) => addTag("deniedMetrics", tag)}
            onRemove={(tag) => removeTag("deniedMetrics", tag)}
            tagColor="red"
          />
        </div>

        {/* Pricing & Constraints */}
        <div className="flow-surface rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Pricing & Constraints
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="flow-label-sm">Min Price per Request (USDC)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={policy.minPricePerRequest}
                onChange={(e) =>
                  setPolicy((prev) => ({ ...prev, minPricePerRequest: Number(e.target.value) }))
                }
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label-sm">Max Rows per Request</label>
              <input
                type="number"
                min={1}
                max={10000}
                value={policy.maxRowsPerRequest}
                onChange={(e) =>
                  setPolicy((prev) => ({ ...prev, maxRowsPerRequest: Number(e.target.value) }))
                }
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label-sm">Max Concurrent Tasks</label>
              <input
                type="number"
                min={1}
                max={50}
                value={policy.maxConcurrentTasks}
                onChange={(e) =>
                  setPolicy((prev) => ({ ...prev, maxConcurrentTasks: Number(e.target.value) }))
                }
                className="flow-input"
              />
            </div>
          </div>
        </div>

        {/* Auto-Accept */}
        <div className="flow-surface rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Auto-Accept
          </h2>

          <label className="flex items-center gap-3 text-sm text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={policy.autoAccept}
              onChange={(e) =>
                setPolicy((prev) => ({ ...prev, autoAccept: e.target.checked }))
              }
              className="h-4 w-4 rounded border-slate-700 bg-slate-900"
            />
            Automatically accept matching tasks without manual consent
          </label>

          {policy.autoAccept && (
            <div className="space-y-4 ml-7 border-l border-slate-700 pl-4">
              <div>
                <label className="flow-label-sm">Max Auto-Accept Price (USDC)</label>
                <p className="mb-1 text-xs text-slate-500">
                  Only auto-accept tasks with budget per request up to this amount.
                </p>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={policy.autoAcceptMaxPrice}
                  onChange={(e) =>
                    setPolicy((prev) => ({ ...prev, autoAcceptMaxPrice: Number(e.target.value) }))
                  }
                  className="flow-input max-w-xs"
                />
              </div>

              <TagInput
                label="Only Auto-Accept These Metrics"
                hint="Leave empty to auto-accept any metric in your allowed list."
                placeholder="e.g. steps, distance..."
                tags={policy.autoAcceptOnlyMetrics}
                onAdd={(tag) => addTag("autoAcceptOnlyMetrics", tag)}
                onRemove={(tag) => removeTag("autoAcceptOnlyMetrics", tag)}
                tagColor="cyan"
              />
            </div>
          )}
        </div>

        {/* Contact & Attestor */}
        <div className="flow-surface rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Contact & Attestor
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="flow-label-sm">Contact Channel</label>
              <select
                value={policy.contactChannel}
                onChange={(e) =>
                  setPolicy((prev) => ({
                    ...prev,
                    contactChannel: e.target.value as SellerPolicy["contactChannel"],
                  }))
                }
                className="flow-input"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
              </select>
            </div>
            <div>
              <label className="flow-label-sm">Contact ID</label>
              <input
                type="text"
                value={policy.contactId}
                onChange={(e) =>
                  setPolicy((prev) => ({ ...prev, contactId: e.target.value }))
                }
                placeholder={
                  policy.contactChannel === "whatsapp"
                    ? "+1 555 123 4567"
                    : policy.contactChannel === "telegram"
                      ? "@username"
                      : "username#0000"
                }
                className="flow-input"
              />
            </div>
          </div>

          <div>
            <label className="flow-label-sm">Attestor URL (optional)</label>
            <p className="mb-1 text-xs text-slate-500">
              Your self-hosted attestor-core instance. Leave empty to use the platform default.
            </p>
            <input
              type="url"
              value={policy.attestorUrl}
              onChange={(e) =>
                setPolicy((prev) => ({ ...prev, attestorUrl: e.target.value }))
              }
              placeholder="https://your-attestor-core:8001"
              className="flow-input"
            />
          </div>
        </div>

        {/* Description */}
        <div className="flow-surface rounded-xl p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Policy Description
          </h2>
          <p className="text-xs text-slate-500">
            Describe your data offering, conditions, and any special requirements. This will be publicly visible on-chain via IPFS.
          </p>
          <textarea
            value={policy.policyDescription}
            onChange={(e) =>
              setPolicy((prev) => ({ ...prev, policyDescription: e.target.value }))
            }
            placeholder="e.g. I provide daily Fitbit health metrics (steps, distance). Data available from Jan 2024. Only for research purposes..."
            rows={4}
            className="flow-input resize-none"
          />
        </div>

        {/* Error / Success */}
        {error && <div className="flow-error">{error}</div>}

        {saved && savedCid && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
            Policy saved successfully. CID:{" "}
            <span className="font-mono">{savedCid}</span>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-4">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            isLoading={saving}
            disabled={saving || policy.dataSources.length === 0}
            className="min-w-[200px]"
          >
            {existingPolicy?.policyCid ? "Update Policy" : "Save Policy"}
          </Button>
          <Link
            href="/seller/dashboard"
            className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </form>
    </div>
  );
}
