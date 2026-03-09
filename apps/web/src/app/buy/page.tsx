"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadJsonToIpfs } from "@/lib/ipfs";
import { buildIndexKey, buildManageDataTx, signAndSubmitTx } from "@/lib/stellar";
import { readMarketplaceMcps, readMcpById } from "@/lib/chain-reader";
import Button from "@/components/ui/Button";
import { useFreighter } from "@/hooks/useFreighter";

/* ─── Verification method options (mirrors sell page) ─── */
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
    desc: "Request data verified from any web API via zero-knowledge TLS proofs.",
    enabled: true,
  },
  {
    id: "device-tee",
    label: "Device (TEE)",
    desc: "Request sensor/device data verified via Trusted Execution Environment.",
    enabled: false,
  },
  {
    id: "fhe-range",
    label: "FHE (Range Query)",
    desc: "Ask yes/no range queries (e.g. age 25-35?) without seeing exact values.",
    enabled: false,
  },
  {
    id: "zk-selective",
    label: "ZK Selective Disclosure",
    desc: "Request only specific fields — provider keeps the rest private.",
    enabled: false,
  },
];

/* ─── Data timing ─── */
type DataTimingMode = "realtime" | "historical" | "periodic";

const TIMING_OPTIONS: { id: DataTimingMode; label: string; desc: string }[] = [
  { id: "realtime", label: "Real-time", desc: "Fresh data fetched at the moment of each proof" },
  { id: "historical", label: "Historical", desc: "Data from a specific date range" },
  { id: "periodic", label: "Periodic", desc: "Recurring collection at regular intervals" },
];

/* ─── Delivery types ─── */
const DELIVERY_CONTENT_TYPES = [
  { value: "application/json", label: "JSON" },
  { value: "application/cbor", label: "CBOR (binary)" },
  { value: "application/octet-stream", label: "Raw binary" },
  { value: "application/protobuf", label: "Protobuf" },
  { value: "text/csv", label: "CSV" },
] as const;

/* ─── Source mode ─── */
type SourceMode = "custom" | "marketplace";

/* ─── Types ─── */
interface McpStandard {
  id: string;
  title: string;
  description: string;
  dataSource: string;
  metrics: string[];
  apiEndpoint: string;
  authType: string;
  responseFormat: string;
  creator: string;
  proofType?: "zk-tls" | "attested-runtime" | "hybrid";
  freshnessSlaHours?: number;
  minWitnessCount?: number;
  deliveryFormat?: "json" | "cbor" | "protobuf";
  schemaVersion?: string;
  usageFee?: number;
}

export default function BuyDataPage() {
  return (
    <Suspense fallback={null}>
      <BuyDataInner />
    </Suspense>
  );
}

function BuyDataInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mcpIdParam = searchParams.get("mcp");
  const freighter = useFreighter();

  /* ── form state ── */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* source mode */
  const [sourceMode, setSourceMode] = useState<SourceMode>(mcpIdParam ? "marketplace" : "custom");
  const [mcp, setMcp] = useState<McpStandard | null>(null);
  const [mcpList, setMcpList] = useState<McpStandard[]>([]);
  const [mcpLoading, setMcpLoading] = useState(!!mcpIdParam);
  const [mcpSearch, setMcpSearch] = useState("");
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(mcpIdParam);

  /* basic info */
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  /* data source (free-form) */
  const [dataSource, setDataSource] = useState("");

  /* metrics (tag-style) */
  const [metrics, setMetrics] = useState<string[]>([]);
  const [metricInput, setMetricInput] = useState("");

  /* verification */
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>("api-zktls");

  /* data timing */
  const [dataTimingMode, setDataTimingMode] = useState<DataTimingMode>("realtime");
  const [historicalStartDate, setHistoricalStartDate] = useState("");
  const [historicalEndDate, setHistoricalEndDate] = useState("");
  const [periodicFrequency, setPeriodicFrequency] = useState("daily");
  const [periodicCustom, setPeriodicCustom] = useState("");

  /* proof constraints */
  const [maxProofAgeHours, setMaxProofAgeHours] = useState(24);
  const [minWitnessCount, setMinWitnessCount] = useState(1);
  const [replayProtectionWindowHours, setReplayProtectionWindowHours] = useState(24);
  const [deliveryContentType, setDeliveryContentType] = useState("application/json");
  const [requireHttpsCallback, setRequireHttpsCallback] = useState(true);
  const [conditions, setConditions] = useState("");

  /* budget */
  const [rewardPerUser, setRewardPerUser] = useState(1.5);
  const [durationDays, setDurationDays] = useState(30);
  const [targetCount, setTargetCount] = useState(100);
  const [totalBudget, setTotalBudget] = useState(150);
  const [callbackUrl, setCallbackUrl] = useState("");
  const [deliveryPublicKey, setDeliveryPublicKey] = useState("");

  /* result */
  const [result, setResult] = useState<{
    skillId: string;
    ipfsHash: string;
    escrowAddress: string;
    stellarTx?: string;
  } | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockResult, setLockResult] = useState<{
    escrowId: string;
    txHash: string;
  } | null>(null);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  /* Chain-first: load MCP list from Stellar + IPFS */
  useEffect(() => {
    readMarketplaceMcps()
      .then((entries) => {
        const mapped: McpStandard[] = entries
          .filter((e) => e.data)
          .map((e) => ({
            id: e.data!.id || e.key.slice(3),
            title: e.data!.title || "Untitled",
            description: e.data!.description || "",
            dataSource: e.data!.dataSource || "custom",
            metrics: e.data!.metrics || [],
            creator: e.data!.creator || "",
            apiEndpoint: "",
            authType: "",
            responseFormat: "",
            proofType: e.data!.proofType as McpStandard["proofType"],
            freshnessSlaHours: e.data!.freshnessSlaHours,
            minWitnessCount: e.data!.minWitnessCount,
            deliveryFormat: e.data!.deliveryFormat as McpStandard["deliveryFormat"],
            schemaVersion: e.data!.schemaVersion,
          }));
        setMcpList(mapped);
      })
      .catch(() => setMcpList([]));
  }, []);

  /* Chain-first: load specific MCP from Stellar + IPFS */
  useEffect(() => {
    if (!mcpIdParam) return;
    readMcpById(mcpIdParam)
      .then((entry) => {
        if (entry?.data) {
          const data: McpStandard = {
            id: entry.data.id || mcpIdParam,
            title: entry.data.title || "Untitled",
            description: entry.data.description || "",
            dataSource: entry.data.dataSource || "custom",
            metrics: entry.data.metrics || [],
            creator: entry.data.creator || "",
            apiEndpoint: "",
            authType: "",
            responseFormat: "",
            proofType: entry.data.proofType as McpStandard["proofType"],
            freshnessSlaHours: entry.data.freshnessSlaHours,
            minWitnessCount: entry.data.minWitnessCount,
            deliveryFormat: entry.data.deliveryFormat as McpStandard["deliveryFormat"],
            schemaVersion: entry.data.schemaVersion,
          };
          setMcp(data);
          applyMcpToForm(data);
        }
      })
      .catch(() => {})
      .finally(() => setMcpLoading(false));
  }, [mcpIdParam]);

  const applyMcpToForm = (m: McpStandard) => {
    setTitle(`${m.title} - Data Program`);
    setDescription(m.description);
    setDataSource(m.dataSource);
    setMetrics(m.metrics || []);
    if (m.proofType === "zk-tls") setVerificationMethod("api-zktls");
    setMaxProofAgeHours(m.freshnessSlaHours ?? 24);
    setMinWitnessCount(m.minWitnessCount ?? 1);
    if (m.deliveryFormat === "json") setDeliveryContentType("application/json");
    else if (m.deliveryFormat === "cbor") setDeliveryContentType("application/cbor");
    else if (m.deliveryFormat === "protobuf") setDeliveryContentType("application/protobuf");
  };

  const handleSelectMcp = (m: McpStandard) => {
    setSelectedMcpId(m.id);
    setMcp(m);
    applyMcpToForm(m);
  };

  /* ── Metric management ── */
  const addMetric = () => {
    const trimmed = metricInput.trim();
    if (!trimmed || metrics.includes(trimmed)) {
      setMetricInput("");
      return;
    }
    setMetrics((prev) => [...prev, trimmed]);
    setMetricInput("");
  };

  const removeMetric = (m: string) => {
    setMetrics((prev) => prev.filter((x) => x !== m));
  };

  const handleMetricKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addMetric();
    }
  };

  /* ── Submit: stake XLM → upload IPFS → write CID to chain ── */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!dataSource.trim()) {
      setError("Enter a data source name");
      return;
    }
    if (metrics.length === 0) {
      setError("Add at least one metric");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      /* Step 1: Stake minimal XLM via Freighter (on-chain program creation signal) */
      const StellarSdk = await import("@stellar/stellar-sdk");
      const mod = await import("@stellar/freighter-api");
      const freighterApi = (mod as Record<string, unknown>).freighterApi ?? mod;

      const server = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");
      const account = await server.loadAccount(stellarAddress!);

      const stakeTx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addMemo(StellarSdk.Memo.text("PROGRAM:CREATE"))
        .addOperation(
          StellarSdk.Operation.payment({
            destination: stellarAddress!, // self-payment as stake signal
            asset: StellarSdk.Asset.native(),
            amount: "1", // 1 XLM stake
          })
        )
        .setTimeout(30)
        .build();

      const signed = await (
        freighterApi as {
          signTransaction: (
            xdr: string,
            opts: { networkPassphrase?: string }
          ) => Promise<{ signedTxXdr: string }>;
        }
      ).signTransaction(stakeTx.toXDR(), {
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      const signedTx = StellarSdk.TransactionBuilder.fromXDR(
        signed.signedTxXdr,
        StellarSdk.Networks.TESTNET
      );
      const stakeTxResult = await server.submitTransaction(signedTx);
      const stakeTxHash = (stakeTxResult as { hash: string }).hash;

      /* Step 2: Upload skill data to IPFS (client-side) */
      const skillId = crypto.randomUUID();
      const skillData = {
        id: skillId,
        title,
        description,
        dataSource: dataSource.trim(),
        metrics,
        verificationMethod,
        dataTimingMode,
        historicalStartDate: dataTimingMode === "historical" ? historicalStartDate : undefined,
        historicalEndDate: dataTimingMode === "historical" ? historicalEndDate : undefined,
        periodicFrequency: dataTimingMode === "periodic" ? periodicFrequency : undefined,
        periodicCustom: dataTimingMode === "periodic" ? periodicCustom : undefined,
        durationDays,
        rewardPerUser,
        totalBudget,
        targetCount,
        callbackUrl: callbackUrl || undefined,
        deliveryPublicKey: deliveryPublicKey || undefined,
        mcpId: selectedMcpId || undefined,
        conditions: conditions || undefined,
        stakeTxHash,
        policy: {
          maxProofAgeHours,
          minWitnessCount,
          replayProtectionWindowHours,
          requireHttpsCallback,
          deliveryContentType,
        },
        createdAt: new Date().toISOString(),
      };

      const ipfsHash = await uploadJsonToIpfs(skillData, {
        name: `skill-${skillId.slice(0, 8)}.json`,
        keyvalues: { type: "skill", id: skillId.slice(0, 32) },
      });

      /* Step 3: Write index to Stellar via Freighter */
      const indexKey = buildIndexKey("skill", skillId);
      const xdr = await buildManageDataTx(stellarAddress!, indexKey, ipfsHash);
      const txHash = await signAndSubmitTx(xdr);

      /* Step 4: Notify backend (facilitator awareness + OpenClaw dispatch) */
      await apiFetch("/api/notify/skill", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          ipfsHash,
          txHash,
          stakeTxHash,
          stellarAddress,
          data: skillData,
        }),
      }).catch((err) => console.warn("[buy] Backend notify failed:", err));

      const escrowAddress = process.env.NEXT_PUBLIC_ESCROW_ADDRESS || "DEPLOY_ESCROW_FIRST";
      setResult({ skillId, ipfsHash, escrowAddress, stellarTx: txHash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Lock USDC escrow ── */
  const handleLockEscrow = async () => {
    if (!result || !stellarAddress) return;
    setLocking(true);
    setError(null);

    try {
      const StellarSdk = await import("@stellar/stellar-sdk");
      const mod = await import("@stellar/freighter-api");
      const freighterApi = (mod as Record<string, unknown>).freighterApi ?? mod;

      const server = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");
      const account = await server.loadAccount(stellarAddress);

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addMemo(StellarSdk.Memo.text(`ESCROW:${result.skillId.slice(0, 16)}`))
        .addOperation(
          StellarSdk.Operation.payment({
            destination: stellarAddress,
            asset: StellarSdk.Asset.native(),
            amount: "0.0000001",
          })
        )
        .setTimeout(30)
        .build();

      const signed = await (
        freighterApi as {
          signTransaction: (
            xdr: string,
            opts: { networkPassphrase?: string }
          ) => Promise<{ signedTxXdr: string }>;
        }
      ).signTransaction(tx.toXDR(), {
        networkPassphrase: "Test SDF Network ; September 2015",
      });

      const signedTx = StellarSdk.TransactionBuilder.fromXDR(
        signed.signedTxXdr,
        StellarSdk.Networks.TESTNET
      );
      const txResult = await server.submitTransaction(signedTx);
      const depositTxHash = (txResult as { hash: string }).hash;

      const lockRes = await apiFetch<{ escrowId: string; txHash: string }>(
        "/api/escrow/lock",
        {
          method: "POST",
          body: JSON.stringify({
            skillId: result.skillId,
            title: title || "Buy Data Program",
            stellarAddress,
            amount: totalBudget,
          }),
        }
      );

      setLockResult({ escrowId: lockRes.escrowId, txHash: depositTxHash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Escrow lock failed");
    } finally {
      setLocking(false);
    }
  };

  /* ── Loading ── */
  if (status === "loading" || mcpLoading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-60 rounded bg-slate-800" />
          <div className="h-4 w-96 rounded bg-slate-900" />
          <div className="h-40 rounded-lg bg-slate-900" />
        </div>
      </div>
    );
  }

  /* ── Result screen ── */
  if (result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flow-surface rounded-xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-emerald-300">
              Buy Data Program Created
            </h2>
            <span className="flow-badge">{lockResult ? "Escrow Locked" : "Staked & Indexed"}</span>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            {lockResult
              ? "USDC escrow locked on Stellar. Providers will be notified. Settlement triggers automatically after proof verification."
              : "Program policy stored on IPFS and indexed on Stellar blockchain. Sellers can query this CID from the chain to review your program details. Lock USDC to activate escrow."}
          </p>
          {error && <div className="flow-error mb-4">{error}</div>}
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400 font-medium">Program ID</dt>
              <dd className="font-mono text-slate-100 break-all">{result.skillId}</dd>
            </div>
            <div>
              <dt className="text-slate-400 font-medium">IPFS CID (Policy)</dt>
              <dd className="font-mono text-emerald-300 break-all">
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${result.ipfsHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {result.ipfsHash}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-slate-400 font-medium">Stellar TX (Stake + Index)</dt>
              <dd className="font-mono text-slate-100 break-all">
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${result.stellarTx}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-300 hover:underline"
                >
                  {result.stellarTx}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-slate-400 font-medium">Escrow Address</dt>
              <dd className="font-mono text-slate-100 break-all">{result.escrowAddress}</dd>
            </div>
            {lockResult && (
              <>
                <div>
                  <dt className="text-slate-400 font-medium">Escrow ID</dt>
                  <dd className="font-mono text-slate-100 break-all">{lockResult.escrowId}</dd>
                </div>
                <div>
                  <dt className="text-slate-400 font-medium">Deposit TX</dt>
                  <dd className="font-mono text-emerald-300 break-all">
                    <a
                      href={`https://stellar.expert/explorer/testnet/tx/${lockResult.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      {lockResult.txHash}
                    </a>
                  </dd>
                </div>
              </>
            )}
          </dl>
          <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-500">
            Sellers can look up this program on-chain via the Stellar manage_data index and fetch the full policy from IPFS using the CID above. Their OpenClaw bot can auto-check compatibility.
          </div>
          <div className="mt-6 flex gap-3">
            {!lockResult && (
              <Button
                variant="primary"
                size="sm"
                isLoading={locking}
                onClick={handleLockEscrow}
              >
                Lock USDC via Freighter
              </Button>
            )}
            <Button
              variant={lockResult ? "primary" : "outline"}
              size="sm"
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResult(null);
                setLockResult(null);
                setError(null);
              }}
            >
              Create Another Program
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Filtered MCP list ── */
  const filteredMcps = mcpList.filter(
    (m) =>
      m.title.toLowerCase().includes(mcpSearch.toLowerCase()) ||
      m.dataSource.toLowerCase().includes(mcpSearch.toLowerCase()) ||
      m.metrics.some((mt) => mt.toLowerCase().includes(mcpSearch.toLowerCase()))
  );

  /* ─── Main form ─── */
  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="flow-badge">Buy Data</span>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">Create Data Program</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Define what data you need, how it should be verified, and your settlement terms.
            Program policy is uploaded to IPFS and indexed on Stellar — sellers can query it directly from the blockchain.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="flow-surface rounded-lg px-3 py-2">
            <p className="text-slate-500">Verification</p>
            <p className="font-semibold text-slate-100 text-xs">{verificationMethod}</p>
          </div>
          <div className="flow-surface rounded-lg px-3 py-2">
            <p className="text-slate-500">Max Proof Age</p>
            <p className="font-semibold text-slate-100">{maxProofAgeHours}h</p>
          </div>
          <div className="flow-surface rounded-lg px-3 py-2">
            <p className="text-slate-500">Timing</p>
            <p className="font-semibold text-slate-100 capitalize">{dataTimingMode}</p>
          </div>
          <div className="flow-surface rounded-lg px-3 py-2">
            <p className="text-slate-500">Source</p>
            <p className="font-semibold text-slate-100 truncate">{dataSource || "—"}</p>
          </div>
        </div>
      </div>

      {error && <div className="flow-error mb-6">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
        <form onSubmit={handleSubmit} className="flow-surface space-y-6 rounded-xl p-6">
          {/* ── Source Mode Toggle ── */}
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Program Source
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Build from scratch or use an existing MCP standard from the marketplace.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSourceMode("custom")}
                className={`rounded-lg border p-3 text-left transition-all ${
                  sourceMode === "custom"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
                }`}
              >
                <p className="text-sm font-semibold text-slate-100">Create Custom</p>
                <p className="mt-1 text-xs text-slate-400">
                  Define your own data source, metrics, and constraints
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSourceMode("marketplace")}
                className={`rounded-lg border p-3 text-left transition-all ${
                  sourceMode === "marketplace"
                    ? "border-emerald-500 bg-emerald-500/10"
                    : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
                }`}
              >
                <p className="text-sm font-semibold text-slate-100">Use MCP Standard</p>
                <p className="mt-1 text-xs text-slate-400">
                  Pick a verified standard from marketplace — pre-configured
                </p>
              </button>
            </div>
          </div>

          {/* ── MCP Marketplace Selector ── */}
          {sourceMode === "marketplace" && (
            <div className="rounded-lg border border-slate-700 bg-slate-900/30 p-4 space-y-3">
              <input
                type="text"
                value={mcpSearch}
                onChange={(e) => setMcpSearch(e.target.value)}
                placeholder="Search MCP standards by name, source, or metric..."
                className="flow-input"
              />
              <div className="max-h-48 overflow-y-auto space-y-2">
                {filteredMcps.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2 text-center">
                    No MCP standards found. Try a different search or create custom.
                  </p>
                ) : (
                  filteredMcps.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => handleSelectMcp(m)}
                      className={`w-full rounded-lg border p-3 text-left transition-all ${
                        selectedMcpId === m.id
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-slate-700 bg-slate-900/40 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-100">{m.title}</p>
                        {m.usageFee ? (
                          <span className="text-xs text-emerald-300">{m.usageFee} USDC/use</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs text-slate-400">
                        {m.dataSource} | {m.metrics.slice(0, 4).join(", ")} | {m.proofType || "zk-tls"}
                      </p>
                    </button>
                  ))
                )}
              </div>
              {mcp && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <p className="text-xs font-semibold text-emerald-300">Selected: {mcp.title}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {mcp.dataSource} | metrics: {mcp.metrics.join(", ")} | API: {mcp.apiEndpoint}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Program Info ── */}
          <div className="border-t border-slate-800 pt-5 space-y-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Program Details
            </h3>
            <div>
              <label className="flow-label">Program Name</label>
              <input
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="flow-input"
                placeholder="e.g. Fitbit Steps - 30 Day Program"
              />
            </div>
            <div>
              <label className="flow-label">Description</label>
              <textarea
                required
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="flow-input"
                placeholder="Describe what data you need, your hypothesis/use-case, and delivery expectations..."
              />
            </div>
          </div>

          {/* ── Data Source (free-form) ── */}
          <div className="border-t border-slate-800 pt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-1">
              Data Source
            </h3>
            <p className="mb-3 text-xs text-slate-500">
              Type any API or data source. No restrictions — zkTLS verifies authenticity from any endpoint.
            </p>
            <input
              type="text"
              value={dataSource}
              onChange={(e) => setDataSource(e.target.value)}
              placeholder="e.g. Fitbit, Twitter API, Bank XYZ, Google Fit, Custom REST..."
              className="flow-input"
            />
          </div>

          {/* ── Metrics (tag input) ── */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-1">
              Required Metrics
            </h3>
            <p className="mb-2 text-xs text-slate-500">
              Add the specific data points you need. Press Enter or comma to add.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={metricInput}
                onChange={(e) => setMetricInput(e.target.value)}
                onKeyDown={handleMetricKeyDown}
                placeholder="e.g. steps, heart_rate, sleep_hours, calories..."
                className="flow-input flex-1"
              />
              <Button type="button" size="sm" variant="outline" onClick={addMetric} disabled={!metricInput.trim()}>
                Add
              </Button>
            </div>
            {metrics.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {metrics.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300"
                  >
                    {m}
                    <button
                      type="button"
                      onClick={() => removeMetric(m)}
                      className="ml-0.5 text-cyan-300/60 hover:text-red-400 transition-colors"
                    >
                      x
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── Verification Method ── */}
          <div className="border-t border-slate-800 pt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
              Verification Method
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {VERIFICATION_METHODS.map((vm) => (
                <button
                  key={vm.id}
                  type="button"
                  disabled={!vm.enabled}
                  onClick={() => vm.enabled && setVerificationMethod(vm.id)}
                  className={`relative rounded-lg border p-3 text-left transition-all ${
                    !vm.enabled
                      ? "cursor-not-allowed border-slate-800 bg-slate-900/30 opacity-50"
                      : verificationMethod === vm.id
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-100">{vm.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{vm.desc}</p>
                  {!vm.enabled && (
                    <span className="absolute right-2 top-2 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      Coming Soon
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Data Timing ── */}
          <div className="border-t border-slate-800 pt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
              Data Timing
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {TIMING_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setDataTimingMode(opt.id)}
                  className={`rounded-lg border p-3 text-left transition-all ${
                    dataTimingMode === opt.id
                      ? "border-emerald-500 bg-emerald-500/10"
                      : "border-slate-700 bg-slate-900/50 hover:border-slate-600"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-100">{opt.label}</p>
                  <p className="mt-1 text-xs text-slate-400">{opt.desc}</p>
                </button>
              ))}
            </div>
            {dataTimingMode === "historical" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="flow-label-sm">Start Date</label>
                  <input
                    type="date"
                    value={historicalStartDate}
                    onChange={(e) => setHistoricalStartDate(e.target.value)}
                    className="flow-input"
                  />
                </div>
                <div>
                  <label className="flow-label-sm">End Date</label>
                  <input
                    type="date"
                    value={historicalEndDate}
                    onChange={(e) => setHistoricalEndDate(e.target.value)}
                    className="flow-input"
                  />
                </div>
              </div>
            )}
            {dataTimingMode === "periodic" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="flow-label-sm">Frequency</label>
                  <select
                    value={periodicFrequency}
                    onChange={(e) => setPeriodicFrequency(e.target.value)}
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
                    value={periodicCustom}
                    onChange={(e) => setPeriodicCustom(e.target.value)}
                    placeholder="e.g. every 3 days, twice per week..."
                    className="flow-input"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Proof Constraints ── */}
          <div className="border-t border-slate-800 pt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
              Proof Constraints
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="flow-label-sm">Max Proof Age (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={maxProofAgeHours}
                  onChange={(e) => setMaxProofAgeHours(Number(e.target.value))}
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Min Witness Count</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={minWitnessCount}
                  onChange={(e) => setMinWitnessCount(Number(e.target.value))}
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Replay Protection Window (hours)</label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={replayProtectionWindowHours}
                  onChange={(e) => setReplayProtectionWindowHours(Number(e.target.value))}
                  className="flow-input"
                />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="flow-label-sm">Delivery Format</label>
                <select
                  value={deliveryContentType}
                  onChange={(e) => setDeliveryContentType(e.target.value)}
                  className="flow-input"
                >
                  {DELIVERY_CONTENT_TYPES.map((ct) => (
                    <option key={ct.value} value={ct.value}>
                      {ct.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 mt-6">
                <input
                  type="checkbox"
                  checked={requireHttpsCallback}
                  onChange={(e) => setRequireHttpsCallback(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                />
                Require HTTPS callback
              </label>
            </div>
          </div>

          {/* ── Additional Conditions ── */}
          <div>
            <label className="flow-label">Additional Conditions (optional)</label>
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              rows={2}
              className="flow-input"
              placeholder="Sampling cadence, exclusion criteria, geographic restrictions, anonymization rules..."
            />
          </div>

          {/* ── Budget & Settlement ── */}
          <div className="border-t border-slate-800 pt-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
              Budget & Settlement
            </h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <div>
                <label className="flow-label-sm">Price (USDC/epoch)</label>
                <input
                  type="number"
                  required
                  min={0.01}
                  step={0.01}
                  value={rewardPerUser}
                  onChange={(e) => setRewardPerUser(Number(e.target.value))}
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Duration (days)</label>
                <input
                  type="number"
                  required
                  min={1}
                  max={365}
                  value={durationDays}
                  onChange={(e) => setDurationDays(Number(e.target.value))}
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Target Providers</label>
                <input
                  type="number"
                  required
                  min={1}
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Total Budget (USDC)</label>
                <input
                  type="number"
                  required
                  min={1}
                  step={0.01}
                  value={totalBudget}
                  onChange={(e) => setTotalBudget(Number(e.target.value))}
                  className="flow-input"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="flow-label-sm">Callback URL (optional)</label>
              <input
                type="url"
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
                className="flow-input"
                placeholder="https://your-api.example/webhook/data-ready"
              />
            </div>

            <div>
              <label className="flow-label">Delivery Public Key (X25519/age)</label>
              <input
                type="text"
                value={deliveryPublicKey}
                onChange={(e) => setDeliveryPublicKey(e.target.value)}
                className="flow-input font-mono"
                placeholder="age1... veya base64 public key"
              />
              <p className="mt-1 text-xs text-slate-500">
                OpenClaw encrypts the payload with this public key. Buyer decrypts via callback private key.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-3 text-xs text-slate-500">
            Clicking below will: (1) Stake 1 XLM via Freighter as a program creation signal, (2) Upload program policy to IPFS, (3) Index the CID on Stellar blockchain. Sellers can then query and review your program on-chain.
          </div>

          <Button type="submit" isLoading={submitting} className="w-full">
            Stake & Create Program
          </Button>
        </form>

        {/* ── Sidebar ── */}
        <aside className="space-y-4">
          <div className="flow-surface rounded-xl p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Execution Pipeline
            </h3>
            <ol className="mt-3 space-y-3 text-sm text-slate-300">
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">1.</span> Stake XLM + policy uploaded to IPFS + CID indexed on Stellar
              </li>
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">2.</span> Matching sellers query CID from chain, review policy via IPFS
              </li>
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">3.</span> Seller&apos;s OpenClaw bot checks compatibility + accepts consent
              </li>
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">4.</span> Proof validated against timestamp + witness + replay policy
              </li>
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">5.</span> Escrow auto-releases on verified proof (3-way split)
              </li>
            </ol>
          </div>

          <div className="flow-surface rounded-xl p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Settlement Split
            </h3>
            <div className="mt-3 space-y-2 text-sm text-slate-400">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-400" />
                  Provider
                </span>
                <span className="text-slate-200 font-medium">70%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  Platform
                </span>
                <span className="text-slate-200 font-medium">20%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  Dispute Pool
                </span>
                <span className="text-slate-200 font-medium">10%</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Atomic 3-way release via Soroban smart contract on Stellar.
            </p>
          </div>

          <div className="flow-surface rounded-xl p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              On-chain Transparency
            </h3>
            <ul className="mt-3 space-y-2 text-xs text-slate-400">
              <li>Program CID is indexed as Stellar manage_data</li>
              <li>Any seller can read CID → fetch IPFS → check policy</li>
              <li>OpenClaw bots auto-filter by policy compatibility</li>
              <li>Stake TX proves buyer commitment before provider consent</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
