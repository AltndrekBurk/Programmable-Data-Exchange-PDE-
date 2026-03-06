"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadJsonToIpfs } from "@/lib/ipfs";
import { buildIndexKey, buildManageDataTx, signAndSubmitTx } from "@/lib/stellar";
import Button from "@/components/ui/Button";

/* ─── Verification method (mirrors sell/buy pages) ─── */
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
    desc: "Data fetched from a web API and verified via zero-knowledge TLS proof.",
    enabled: true,
  },
  {
    id: "device-tee",
    label: "Device (TEE)",
    desc: "Data from device sensors verified via Trusted Execution Environment.",
    enabled: false,
  },
  {
    id: "fhe-range",
    label: "FHE (Range Query)",
    desc: "Homomorphic encryption for yes/no range queries without revealing values.",
    enabled: false,
  },
  {
    id: "zk-selective",
    label: "ZK Selective Disclosure",
    desc: "Reveal only chosen fields while keeping the rest private.",
    enabled: false,
  },
];

/* ─── Data timing ─── */
type DataTimingMode = "realtime" | "historical" | "periodic";

const TIMING_OPTIONS: { id: DataTimingMode; label: string; desc: string }[] = [
  { id: "realtime", label: "Real-time", desc: "Fresh data fetched at time of proof generation" },
  { id: "historical", label: "Historical", desc: "Data from a specific date range in the past" },
  { id: "periodic", label: "Periodic", desc: "Recurring collection at defined intervals" },
];

/* ─── Auth types ─── */
const AUTH_TYPES = [
  { value: "oauth2", label: "OAuth 2.0", desc: "Standard OAuth flow with access tokens" },
  { value: "api_key", label: "API Key", desc: "Static key passed in header or query param" },
  { value: "bearer", label: "Bearer Token", desc: "Token-based auth (JWT, session token)" },
  { value: "none", label: "Public API", desc: "No authentication required" },
];

export default function UploadMcpPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ id: string; ipfsHash: string; stellarTx?: string } | null>(null);
  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  /* ── Form state ── */
  // Identity
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetApp, setTargetApp] = useState("");
  const [dataSource, setDataSource] = useState("");

  // Use case
  const [useCase, setUseCase] = useState("");
  const [targetSector, setTargetSector] = useState("");

  // API config
  const [apiEndpoint, setApiEndpoint] = useState("");
  const [authType, setAuthType] = useState("oauth2");
  const [oauthScopes, setOauthScopes] = useState("");
  const [responseFormat, setResponseFormat] = useState("");
  const [rateLimitInfo, setRateLimitInfo] = useState("");
  const [exampleResponse, setExampleResponse] = useState("");
  const [errorCodes, setErrorCodes] = useState("");

  // Verification
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>("api-zktls");

  // Data timing
  const [dataTimingMode, setDataTimingMode] = useState<DataTimingMode>("realtime");
  const [updateFrequency, setUpdateFrequency] = useState("");

  // Metrics (tag input)
  const [metrics, setMetrics] = useState<string[]>([]);
  const [metricInput, setMetricInput] = useState("");

  // Proof constraints
  const [freshnessSlaHours, setFreshnessSlaHours] = useState(24);
  const [minWitnessCount, setMinWitnessCount] = useState(1);
  const [deliveryFormat, setDeliveryFormat] = useState("json");
  const [requiresConsentTx, setRequiresConsentTx] = useState(true);

  // Pricing
  const [usageFee, setUsageFee] = useState(0.05);

  // Skill doc file
  const [skillDocFile, setSkillDocFile] = useState<File | null>(null);
  const [skillDocContent, setSkillDocContent] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

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

  const removeMetric = (m: string) => setMetrics((prev) => prev.filter((x) => x !== m));

  const handleMetricKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addMetric();
    }
  };

  /* ── File handling ── */
  const processFile = (file: File) => {
    if (!file.name.endsWith(".md") && !file.name.endsWith(".txt") && !file.name.endsWith(".json")) {
      setError("Only .md, .txt, or .json files are accepted");
      return;
    }
    if (file.size > 512 * 1024) {
      setError("File too large — max 512 KB");
      return;
    }
    setSkillDocFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setSkillDocContent(e.target?.result as string);
      setError(null);
    };
    reader.readAsText(file);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragActive(false), []);

  /* ── Submit ── */
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!targetApp.trim()) {
      setError("Specify the target application/service name");
      return;
    }
    if (!apiEndpoint.trim()) {
      setError("API endpoint URL is required");
      return;
    }
    if (metrics.length === 0) {
      setError("Add at least one metric");
      return;
    }
    if (!useCase.trim()) {
      setError("Describe the use case for this MCP");
      return;
    }

    setSubmitting(true);
    setError(null);

    const body = {
      title,
      description,
      targetApp: targetApp.trim(),
      dataSource: dataSource.trim() || targetApp.trim().toLowerCase().replace(/\s+/g, "-"),
      useCase,
      targetSector: targetSector || undefined,
      metrics,
      apiEndpoint,
      authType,
      oauthScopes: oauthScopes || undefined,
      responseFormat: responseFormat || undefined,
      rateLimitInfo: rateLimitInfo || undefined,
      exampleResponse: exampleResponse || undefined,
      errorCodes: errorCodes || undefined,
      verificationMethod,
      dataTimingMode,
      updateFrequency: updateFrequency || undefined,
      freshnessSlaHours,
      minWitnessCount,
      deliveryFormat,
      requiresConsentTx,
      usageFee,
      creatorAddress: stellarAddress || undefined,
      skillDocContent: skillDocContent || undefined,
      skillDocFilename: skillDocFile?.name || undefined,
    };

    try {
      if (!stellarAddress) {
        setError("Wallet not connected");
        return;
      }

      const id = crypto.randomUUID();

      // Step 1: Upload skill doc to IPFS if provided
      let skillDocCid: string | undefined;
      if (skillDocContent) {
        skillDocCid = await uploadJsonToIpfs(
          {
            type: "skill-document",
            mcpId: id,
            filename: skillDocFile?.name || "skill.md",
            content: skillDocContent,
            uploadedAt: new Date().toISOString(),
          },
          {
            name: `skill-doc-${id.slice(0, 8)}.json`,
            keyvalues: { type: "skill-doc", mcpId: id.slice(0, 32) },
          }
        );
      }

      // Step 2: Build MCP data and upload to IPFS
      const advancedConfig = JSON.stringify({
        targetApp: body.targetApp,
        useCase: body.useCase,
        targetSector: body.targetSector,
        verificationMethod: body.verificationMethod,
        dataTimingMode: body.dataTimingMode,
        updateFrequency: body.updateFrequency,
        oauthScopes: body.oauthScopes,
        rateLimitInfo: body.rateLimitInfo,
        exampleResponse: body.exampleResponse,
        errorCodes: body.errorCodes,
        skillDocCid,
      });

      const mcpData = {
        id,
        ...body,
        advancedConfig,
        createdAt: new Date().toISOString(),
      };

      const ipfsHash = await uploadJsonToIpfs(mcpData, {
        name: `mcp-${id.slice(0, 8)}.json`,
        keyvalues: { type: "mcp", id: id.slice(0, 32) },
      });

      // Step 3: Write index to Stellar via Freighter
      const indexKey = buildIndexKey("mcp", id);
      const xdr = await buildManageDataTx(stellarAddress, indexKey, ipfsHash);
      const txHash = await signAndSubmitTx(xdr);

      // Step 4: Notify backend (facilitator awareness)
      await apiFetch("/api/notify/mcp", {
        method: "POST",
        body: JSON.stringify({
          id,
          ipfsHash,
          txHash,
          stellarAddress,
          data: mcpData,
        }),
      }).catch((err) => console.warn("[upload] Backend notify failed:", err));

      setSuccess({ id, ipfsHash, stellarTx: txHash });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return null;

  /* ── Success screen ── */
  if (success) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flow-surface rounded-xl p-6">
          <h2 className="text-lg font-semibold text-emerald-300">MCP Standard Published</h2>
          <p className="mt-2 text-sm text-slate-400">
            Your MCP standard is now live on the marketplace. Buyers can use it to create data programs. You earn {usageFee} USDC per use.
          </p>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-400 font-medium">MCP ID</dt>
              <dd className="font-mono text-slate-100 break-all">{success.id}</dd>
            </div>
            <div>
              <dt className="text-slate-400 font-medium">IPFS CID</dt>
              <dd className="font-mono text-emerald-300 break-all">
                <a
                  href={`https://gateway.pinata.cloud/ipfs/${success.ipfsHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  {success.ipfsHash}
                </a>
              </dd>
            </div>
            {success.stellarTx && (
              <div>
                <dt className="text-slate-400 font-medium">Stellar TX</dt>
                <dd className="font-mono text-emerald-300 break-all">
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${success.stellarTx}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {success.stellarTx}
                  </a>
                </dd>
              </div>
            )}
          </dl>
          <div className="mt-6 flex gap-3">
            <Button variant="primary" size="sm" onClick={() => router.push("/marketplace")}>
              View Marketplace
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setSuccess(null); }}>
              Publish Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Main form ─── */
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <span className="flow-badge">Creator Console</span>
      <h1 className="mt-3 text-3xl font-bold text-slate-100">Publish MCP Standard</h1>
      <p className="mt-2 mb-8 max-w-2xl text-sm text-slate-400">
        Create a reusable data extraction standard for a specific application/API. Buyers use your MCP to create data programs. You earn USDC per use. All MCP data is stored on IPFS and indexed on Stellar.
      </p>

      {error && <div className="flow-error mb-6">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ═══ SECTION 1: Identity ═══ */}
        <div className="flow-surface rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            1. MCP Identity
          </h2>

          <div>
            <label className="flow-label">Standard Title *</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flow-input"
              placeholder="e.g. Fitbit Daily Activity Summary, Strava Run Stats, Spotify Listening History"
            />
          </div>

          <div>
            <label className="flow-label">Target Application / Service *</label>
            <p className="mb-1 text-xs text-slate-500">
              The specific app or API this MCP extracts data from. Be precise — not &quot;health app&quot; but the actual name.
            </p>
            <input
              required
              value={targetApp}
              onChange={(e) => setTargetApp(e.target.value)}
              className="flow-input"
              placeholder="e.g. Fitbit Web API, Strava API v3, Spotify Web API, GitHub REST API v2022"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="flow-label">Data Source Identifier</label>
              <p className="mb-1 text-xs text-slate-500">
                Short identifier for matching (auto-generated from app name if empty).
              </p>
              <input
                value={dataSource}
                onChange={(e) => setDataSource(e.target.value)}
                className="flow-input"
                placeholder="e.g. fitbit, strava-v3, spotify, github"
              />
            </div>
            <div>
              <label className="flow-label">Target Sector / Domain</label>
              <input
                value={targetSector}
                onChange={(e) => setTargetSector(e.target.value)}
                className="flow-input"
                placeholder="e.g. Health & Fitness, Finance, Social, Developer Tools"
              />
            </div>
          </div>

          <div>
            <label className="flow-label">Description *</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flow-input"
              placeholder="What data this MCP extracts, from which endpoints, and in what format. Be specific about the data points returned..."
            />
          </div>

          <div>
            <label className="flow-label">Use Case / Purpose *</label>
            <p className="mb-1 text-xs text-slate-500">
              Who would buy this data and why? What research or business problem does it solve?
            </p>
            <textarea
              required
              rows={2}
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              className="flow-input"
              placeholder="e.g. Health researchers studying daily activity patterns across demographics. Insurance companies verifying fitness claims. Wellness apps benchmarking user activity..."
            />
          </div>
        </div>

        {/* ═══ SECTION 2: API Configuration ═══ */}
        <div className="flow-surface rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            2. API Configuration
          </h2>

          <div>
            <label className="flow-label">API Endpoint URL *</label>
            <p className="mb-1 text-xs text-slate-500">
              The exact URL that zkTLS will call. Must be the real, working endpoint.
            </p>
            <input
              required
              type="url"
              value={apiEndpoint}
              onChange={(e) => setApiEndpoint(e.target.value)}
              className="flow-input"
              placeholder="https://api.fitbit.com/1/user/-/activities/date/today.json"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="flow-label">Authentication Type *</label>
              <div className="space-y-2 mt-1">
                {AUTH_TYPES.map((at) => (
                  <label
                    key={at.value}
                    className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                      authType === at.value
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-slate-700 bg-slate-900/40 hover:border-slate-600"
                    }`}
                  >
                    <input
                      type="radio"
                      name="authType"
                      value={at.value}
                      checked={authType === at.value}
                      onChange={(e) => setAuthType(e.target.value)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-100">{at.label}</p>
                      <p className="text-xs text-slate-400">{at.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              {authType === "oauth2" && (
                <div>
                  <label className="flow-label">Required OAuth Scopes</label>
                  <input
                    value={oauthScopes}
                    onChange={(e) => setOauthScopes(e.target.value)}
                    className="flow-input"
                    placeholder="e.g. activity heartrate sleep profile"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Space-separated list of OAuth scopes the provider needs to grant.
                  </p>
                </div>
              )}
              <div>
                <label className="flow-label">Response JSON Path</label>
                <input
                  value={responseFormat}
                  onChange={(e) => setResponseFormat(e.target.value)}
                  className="flow-input"
                  placeholder="$.summary.steps or $.data[0].value"
                />
                <p className="mt-1 text-xs text-slate-500">
                  JSONPath to extract the relevant metric from API response.
                </p>
              </div>
              <div>
                <label className="flow-label">Rate Limit Info</label>
                <input
                  value={rateLimitInfo}
                  onChange={(e) => setRateLimitInfo(e.target.value)}
                  className="flow-input"
                  placeholder="e.g. 150 requests/hour per user token"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="flow-label">Example API Response (optional)</label>
            <p className="mb-1 text-xs text-slate-500">
              A real or sanitized example response from the API. Helps buyers understand the data structure.
            </p>
            <textarea
              rows={4}
              value={exampleResponse}
              onChange={(e) => setExampleResponse(e.target.value)}
              className="flow-input font-mono text-xs"
              placeholder={'{\n  "summary": {\n    "steps": 8432,\n    "caloriesOut": 2156,\n    "activeMinutes": 47\n  }\n}'}
            />
          </div>

          <div>
            <label className="flow-label">Error Codes & Handling (optional)</label>
            <textarea
              rows={2}
              value={errorCodes}
              onChange={(e) => setErrorCodes(e.target.value)}
              className="flow-input text-xs"
              placeholder="401: Token expired, re-auth needed. 429: Rate limited, retry after X seconds. 403: Missing scope."
            />
          </div>
        </div>

        {/* ═══ SECTION 3: Required Metrics ═══ */}
        <div className="flow-surface rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            3. Required Metrics *
          </h2>
          <p className="text-xs text-slate-500">
            The specific data points this MCP extracts. These become the proof targets — each metric must be verifiable via zkTLS.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={metricInput}
              onChange={(e) => setMetricInput(e.target.value)}
              onKeyDown={handleMetricKeyDown}
              placeholder="e.g. daily_steps, heart_rate_avg, sleep_hours, calories_burned..."
              className="flow-input flex-1"
            />
            <Button type="button" size="sm" variant="outline" onClick={addMetric} disabled={!metricInput.trim()}>
              Add
            </Button>
          </div>
          {metrics.length > 0 && (
            <div className="flex flex-wrap gap-2">
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

        {/* ═══ SECTION 4: Verification & Data Timing ═══ */}
        <div className="flow-surface rounded-xl p-6 space-y-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            4. Verification & Data Timing
          </h2>

          {/* Verification method */}
          <div>
            <label className="flow-label mb-2">Verification Method *</label>
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

          {/* Data timing */}
          <div>
            <label className="flow-label mb-2">Data Timing *</label>
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
          </div>

          <div>
            <label className="flow-label">Data Update Frequency</label>
            <p className="mb-1 text-xs text-slate-500">
              How often does the source API update its data? Helps buyers set realistic freshness SLAs.
            </p>
            <input
              value={updateFrequency}
              onChange={(e) => setUpdateFrequency(e.target.value)}
              className="flow-input"
              placeholder="e.g. Every 15 minutes, Hourly, Daily at midnight UTC, Weekly on Monday"
            />
          </div>

          {/* Proof constraints */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="flow-label">Freshness SLA (hours)</label>
              <input
                type="number"
                min={1}
                max={168}
                value={freshnessSlaHours}
                onChange={(e) => setFreshnessSlaHours(Number(e.target.value))}
                className="flow-input"
              />
              <p className="mt-1 text-xs text-slate-500">Max age of proof before considered stale.</p>
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
              <p className="mt-1 text-xs text-slate-500">Required attestor witnesses for proof validity.</p>
            </div>
            <div>
              <label className="flow-label">Delivery Format</label>
              <select
                value={deliveryFormat}
                onChange={(e) => setDeliveryFormat(e.target.value)}
                className="flow-input"
              >
                <option value="json">JSON</option>
                <option value="cbor">CBOR (binary)</option>
                <option value="protobuf">Protobuf</option>
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={requiresConsentTx}
              onChange={(e) => setRequiresConsentTx(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-900"
            />
            Require explicit on-chain consent transaction from provider
          </label>
        </div>

        {/* ═══ SECTION 5: Skill Documentation (file upload) ═══ */}
        <div className="flow-surface rounded-xl p-6 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
            5. Skill Documentation (optional)
          </h2>
          <p className="text-xs text-slate-500">
            Upload a .md or .txt file with detailed instructions for the data extraction skill.
            This gets uploaded to IPFS alongside the MCP metadata. Providers&apos; OpenClaw bots can read this to understand exactly how to execute the skill.
          </p>

          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all ${
              dragActive
                ? "border-emerald-500 bg-emerald-500/10"
                : skillDocFile
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-slate-700 bg-slate-900/30 hover:border-slate-600"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt,.json"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
            />
            {skillDocFile ? (
              <div>
                <p className="text-sm font-medium text-emerald-300">{skillDocFile.name}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {(skillDocFile.size / 1024).toFixed(1)} KB — will be uploaded to IPFS
                </p>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSkillDocFile(null);
                    setSkillDocContent(null);
                  }}
                  className="mt-2 text-xs text-red-400 hover:text-red-300"
                >
                  Remove file
                </button>
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-300">
                  Drag & drop your skill.md file here
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  or click to browse — .md, .txt, .json (max 512 KB)
                </p>
              </div>
            )}
          </div>

          {skillDocContent && (
            <details className="rounded-lg border border-slate-700 bg-slate-900/30">
              <summary className="cursor-pointer px-4 py-2 text-xs text-slate-400 hover:text-slate-300">
                Preview uploaded document ({skillDocContent.length} chars)
              </summary>
              <pre className="max-h-48 overflow-auto px-4 py-3 text-xs text-slate-300 whitespace-pre-wrap">
                {skillDocContent.slice(0, 3000)}
                {skillDocContent.length > 3000 && "\n\n... (truncated)"}
              </pre>
            </details>
          )}
        </div>

        {/* ═══ SECTION 6: Pricing ═══ */}
        <div className="flow-surface rounded-xl p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-emerald-300">
            6. Pricing
          </h2>
          <div className="max-w-xs">
            <label className="flow-label">Usage Fee (USDC per use)</label>
            <input
              type="number"
              min={0}
              max={10}
              step={0.01}
              value={usageFee}
              onChange={(e) => setUsageFee(Number(e.target.value))}
              className="flow-input"
            />
            <p className="mt-1 text-xs text-slate-500">
              You earn this amount each time a buyer uses your MCP standard. Paid via Stellar USDC.
            </p>
          </div>
        </div>

        {/* ═══ Submit ═══ */}
        <div className="rounded-lg border border-slate-700 bg-slate-900/40 p-4 text-xs text-slate-500">
          On publish: All MCP data + skill document are uploaded to IPFS and indexed on Stellar blockchain.
          The CID is stored on-chain so buyers and sellers can verify the standard independently.
        </div>

        <Button type="submit" isLoading={submitting} className="w-full">
          Publish MCP Standard
        </Button>
      </form>
    </div>
  );
}
