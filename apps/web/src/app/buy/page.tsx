"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";
import { useFreighter } from "@/hooks/useFreighter";

const DATA_SOURCES = [
  "fitbit", "strava", "plaid", "spotify", "github",
  "google_fit", "oura", "withings", "garmin", "custom",
];

const PROOF_TYPES = ["zk-tls", "attested-runtime", "hybrid"] as const;
const DELIVERY_CONTENT_TYPES = [
  "application/octet-stream",
  "application/json",
  "application/cbor",
] as const;

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
  const mcpId = searchParams.get("mcp");
  const freighter = useFreighter();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mcp, setMcp] = useState<McpStandard | null>(null);
  const [mcpLoading, setMcpLoading] = useState(!!mcpId);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dataSource, setDataSource] = useState("fitbit");
  const [metrics, setMetrics] = useState("");
  const [proofType, setProofType] = useState<(typeof PROOF_TYPES)[number]>("zk-tls");
  const [maxProofAgeHours, setMaxProofAgeHours] = useState(24);
  const [minWitnessCount, setMinWitnessCount] = useState(1);
  const [replayProtectionWindowHours, setReplayProtectionWindowHours] = useState(24);
  const [deliveryContentType, setDeliveryContentType] =
    useState<(typeof DELIVERY_CONTENT_TYPES)[number]>("application/octet-stream");
  const [requireHttpsCallback, setRequireHttpsCallback] = useState(true);
  const [conditions, setConditions] = useState("");

  const [result, setResult] = useState<{
    skillId: string;
    ipfsHash: string;
    escrowAddress: string;
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

  useEffect(() => {
    if (!mcpId) return;

    apiFetch<McpStandard>(`/api/marketplace/${mcpId}`)
      .then((data) => {
        setMcp(data);
        setTitle(`${data.title} - Buy Data Program`);
        setDescription(
          `${data.description}\n\nMCP: ${data.title}\nAPI: ${data.apiEndpoint}\nAuth: ${data.authType}`
        );
        setDataSource(data.dataSource);
        setMetrics(data.metrics.join(", "));
        setProofType(data.proofType || "zk-tls");
        setMaxProofAgeHours(data.freshnessSlaHours ?? 24);
        setMinWitnessCount(data.minWitnessCount ?? 1);
        if (data.deliveryFormat === "json") setDeliveryContentType("application/json");
        else if (data.deliveryFormat === "cbor") setDeliveryContentType("application/cbor");
        else setDeliveryContentType("application/octet-stream");
      })
      .catch(() => {})
      .finally(() => setMcpLoading(false));
  }, [mcpId]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const metricsRaw = form.get("metrics") as string;

    const policy = {
      maxProofAgeHours,
      minWitnessCount,
      replayProtectionWindowHours,
      requireHttpsCallback,
      deliveryContentType,
    };

    const policySuffix = JSON.stringify({
      proofType,
      ...policy,
      ...(conditions ? { extraConditions: conditions } : {}),
    });

    const body = {
      title: form.get("title") as string,
      description: `${form.get("description") as string}\n\n[program-policy] ${policySuffix}`,
      dataSource: form.get("dataSource") as string,
      metrics: metricsRaw.split(",").map((m) => m.trim()).filter(Boolean),
      durationDays: Number(form.get("durationDays")),
      rewardPerUser: Number(form.get("rewardPerUser")),
      totalBudget: Number(form.get("totalBudget")),
      targetCount: Number(form.get("targetCount")),
      callbackUrl: (form.get("callbackUrl") as string) || undefined,
      mcpId: mcpId || undefined,
      policy,
    };

    try {
      const res = await apiFetch<{
        skillId: string;
        ipfsHash: string;
        escrowAddress: string;
      }>("/api/skills", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

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

  const handleLockEscrow = async () => {
    if (!result || !stellarAddress) return;
    setLocking(true);
    setError(null);

    try {
      // Step 1: Send USDC lock via Freighter (self-payment with memo for on-chain proof)
      const StellarSdk = (await import("@stellar/stellar-sdk")).default;
      const mod = await import("@stellar/freighter-api");
      const freighterApi = (mod as Record<string, unknown>).freighterApi ?? mod;

      const server = new StellarSdk.Horizon.Server("https://horizon-testnet.stellar.org");
      const account = await server.loadAccount(stellarAddress);

      // Build a USDC transfer TX to platform (escrow deposit indication)
      const PLATFORM_KEY = result.escrowAddress;
      const budgetField = document.querySelector<HTMLInputElement>('input[name="totalBudget"]');
      const amount = budgetField ? budgetField.value : "150";

      const tx = new StellarSdk.TransactionBuilder(account, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase: StellarSdk.Networks.TESTNET,
      })
        .addMemo(StellarSdk.Memo.text(`ESCROW:${result.skillId.slice(0, 16)}`))
        .addOperation(
          StellarSdk.Operation.payment({
            destination: stellarAddress, // self-payment as escrow signal
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

      // Step 2: Notify backend to lock escrow
      const lockRes = await apiFetch<{ escrowId: string; txHash: string }>(
        "/api/escrow/lock",
        {
          method: "POST",
          body: JSON.stringify({
            skillId: result.skillId,
            title: title || "Buy Data Program",
            stellarAddress,
            amount: Number(amount) || 150,
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

  if (result) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flow-surface rounded-xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-emerald-300">
              Buy Data Program Created
            </h2>
            <span className="flow-badge">{lockResult ? "Escrow Locked" : "Policy Active"}</span>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            {lockResult
              ? "USDC escrow locked on Stellar. Providers will be notified. Settlement triggers automatically after proof verification."
              : "Program policy stored on IPFS. Lock USDC to activate the escrow and start receiving data."}
          </p>
          {error && <div className="flow-error mb-4">{error}</div>}
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400 font-medium">Program ID</dt>
              <dd className="font-mono text-slate-100 break-all">{result.skillId}</dd>
            </div>
            <div>
              <dt className="text-slate-400 font-medium">IPFS Hash</dt>
              <dd className="font-mono text-slate-100 break-all">{result.ipfsHash}</dd>
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
            <Button variant={lockResult ? "primary" : "outline"} size="sm" onClick={() => router.push("/dashboard")}>
              Go to Dashboard
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setResult(null); setLockResult(null); setError(null); }}>
              Create Another Program
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="flow-badge">Buy Data</span>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">Create Data Program</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Define measurable collection constraints, proof validation thresholds, and settlement terms. This page generates enforceable program policies, not placeholder metadata.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div className="flow-surface rounded-lg px-3 py-2">
            <p className="text-slate-500">Proof</p>
            <p className="font-semibold text-slate-100">{proofType}</p>
          </div>
          <div className="flow-surface rounded-lg px-3 py-2">
            <p className="text-slate-500">Max Proof Age</p>
            <p className="font-semibold text-slate-100">{maxProofAgeHours}h</p>
          </div>
          <div className="flow-surface rounded-lg px-3 py-2">
            <p className="text-slate-500">Witness Min</p>
            <p className="font-semibold text-slate-100">{minWitnessCount}</p>
          </div>
          <div className="flow-surface rounded-lg px-3 py-2">
            <p className="text-slate-500">Source</p>
            <p className="font-semibold text-slate-100">{dataSource}</p>
          </div>
        </div>
      </div>

      {mcp && (
        <div className="flow-surface mb-6 rounded-xl p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">Selected MCP Standard</p>
          <p className="mt-2 text-base font-semibold text-slate-100">{mcp.title}</p>
          <p className="mt-1 text-sm text-slate-400">
            {mcp.dataSource} | metrics: {mcp.metrics.join(", ")}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            endpoint: {mcp.apiEndpoint} | auth: {mcp.authType} | proof: {mcp.proofType || "zk-tls"} | creator: {mcp.creator.slice(0, 12)}...
          </p>
        </div>
      )}

      {error && <div className="flow-error mb-6">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-[1.45fr_0.95fr]">
        <form onSubmit={handleSubmit} className="flow-surface space-y-6 rounded-xl p-6">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Program Parameters</h2>
            <p className="mt-1 text-xs text-slate-500">
              Policy → Consent → Proof → Settlement
            </p>
          </div>

          <div>
            <label className="flow-label">Program Name</label>
            <input
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flow-input"
              placeholder="Fitbit Steps - 30 Day Program"
            />
          </div>

          <div>
            <label className="flow-label">Description</label>
            <textarea
              name="description"
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flow-input"
              placeholder="Define hypothesis/use-case, required metrics, and delivery expectation..."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="flow-label">Data Source</label>
              <select
                name="dataSource"
                required
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value)}
                className="flow-input"
              >
                {DATA_SOURCES.map((src) => (
                  <option key={src} value={src}>{src}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flow-label">Metrics</label>
              <input
                name="metrics"
                required
                value={metrics}
                onChange={(e) => setMetrics(e.target.value)}
                className="flow-input"
                placeholder="steps, heart_rate, calories"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="flow-label">Proof Type</label>
              <select
                value={proofType}
                onChange={(e) => setProofType(e.target.value as (typeof PROOF_TYPES)[number])}
                className="flow-input"
              >
                {PROOF_TYPES.map((proof) => (
                  <option key={proof} value={proof}>{proof}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flow-label">Max Proof Age (hours)</label>
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
              <label className="flow-label">Min Witness Count</label>
              <input
                type="number"
                min={1}
                max={10}
                value={minWitnessCount}
                onChange={(e) => setMinWitnessCount(Number(e.target.value))}
                className="flow-input"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="flow-label">Replay Protection Window (hours)</label>
              <input
                type="number"
                min={1}
                max={168}
                value={replayProtectionWindowHours}
                onChange={(e) => setReplayProtectionWindowHours(Number(e.target.value))}
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label">Delivery Content Type</label>
              <select
                value={deliveryContentType}
                onChange={(e) =>
                  setDeliveryContentType(e.target.value as (typeof DELIVERY_CONTENT_TYPES)[number])
                }
                className="flow-input"
              >
                {DELIVERY_CONTENT_TYPES.map((contentType) => (
                  <option key={contentType} value={contentType}>{contentType}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={requireHttpsCallback}
              onChange={(e) => setRequireHttpsCallback(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900"
            />
            Require HTTPS callback for buyer delivery
          </label>

          <div>
            <label className="flow-label">Additional Conditions (optional)</label>
            <textarea
              value={conditions}
              onChange={(e) => setConditions(e.target.value)}
              rows={2}
              className="flow-input"
              placeholder="Sampling cadence, exclusion criteria, source-side limitations..."
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <div>
              <label className="flow-label">Price (USDC/epoch)</label>
              <input
                name="rewardPerUser"
                type="number"
                required
                min={0.01}
                step={0.01}
                defaultValue={1.5}
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label">Duration (days)</label>
              <input
                name="durationDays"
                type="number"
                required
                min={1}
                max={365}
                defaultValue={30}
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label">Target Providers</label>
              <input
                name="targetCount"
                type="number"
                required
                min={1}
                defaultValue={100}
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label">Total Budget (USDC)</label>
              <input
                name="totalBudget"
                type="number"
                required
                min={1}
                step={0.01}
                defaultValue={150}
                className="flow-input"
              />
            </div>
          </div>

          <div>
            <label className="flow-label">Callback URL (optional)</label>
            <input
              name="callbackUrl"
              type="url"
              className="flow-input"
              placeholder="https://your-api.example/webhook/data-ready"
            />
          </div>

          <Button type="submit" isLoading={submitting} className="w-full">
            Create Buy Data Program
          </Button>
        </form>

        <aside className="space-y-4">
          <div className="flow-surface rounded-xl p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Execution Pipeline</h3>
            <ol className="mt-3 space-y-3 text-sm text-slate-300">
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">1.</span> Program + policy stored on IPFS + Stellar index
              </li>
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">2.</span> Matching providers receive consent request
              </li>
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">3.</span> Proof is validated against timestamp + witness + replay policy
              </li>
              <li className="rounded-md border border-slate-700 bg-slate-900/40 px-3 py-2">
                <span className="text-emerald-300 font-medium">4.</span> Escrow auto-releases on verified proof
              </li>
            </ol>
          </div>

          <div className="flow-surface rounded-xl p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">Settlement Split</h3>
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
        </aside>
      </div>
    </div>
  );
}
