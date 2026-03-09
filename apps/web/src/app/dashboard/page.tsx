"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";
import { useFreighter } from "@/hooks/useFreighter";
import {
  readDashboardState,
  type DashboardChainState,
} from "@/lib/chain-reader";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const freighter = useFreighter();

  const [chainState, setChainState] = useState<DashboardChainState | null>(null);
  const [loading, setLoading] = useState(true);
  const [chainError, setChainError] = useState<string | null>(null);

  /* Escrow event stream */
  const [escrowEvents, setEscrowEvents] = useState<Array<{
    type: string;
    escrowId: string;
    timestamp: string;
    detail?: string;
  }>>([]);

  /* Bot config */
  const [showBotSetup, setShowBotSetup] = useState(false);
  const [botUrl, setBotUrl] = useState("");
  const [botToken, setBotToken] = useState("");
  const [botChannel, setBotChannel] = useState<"whatsapp" | "telegram" | "discord">("whatsapp");
  const [botSaving, setBotSaving] = useState(false);
  const [botSaved, setBotSaved] = useState(false);
  const [botTesting, setBotTesting] = useState(false);
  const [botTestResult, setBotTestResult] = useState<string | null>(null);

  /* Consent */
  const [consentLoading, setConsentLoading] = useState<string | null>(null);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  /* ── Load on-chain state directly from Stellar Horizon + IPFS ── */
  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    const pseudoId = (session?.user as { pseudoId?: string })?.pseudoId;
    if (!pseudoId) return;

    readDashboardState(pseudoId, stellarAddress)
      .then((data) => {
        setChainState(data);
        if (data.providerStatus?.openclawUrl) {
          setBotUrl(data.providerStatus.openclawUrl);
        }
      })
      .catch((err) => setChainError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [status, stellarAddress, session]);

  /* ── Derive escrow events from chain state ── */
  useEffect(() => {
    if (!chainState?.userEscrows?.length) return;
    const events = chainState.userEscrows
      .map((e) => {
        const evts = [];
        evts.push({
          type: "deposited",
          escrowId: e.key,
          timestamp: "",
          detail: `${e.data?.totalBudget || 0} USDC locked`,
        });
        if (e.data?.status === "released") {
          evts.push({
            type: "released",
            escrowId: e.key,
            timestamp: "",
            detail: `${e.data?.released || 0} USDC released (70/20/10)`,
          });
        }
        if (e.data?.status === "disputed") {
          evts.push({
            type: "disputed",
            escrowId: e.key,
            timestamp: "",
            detail: "Escrow under dispute",
          });
        }
        if (e.data?.status === "refunded") {
          evts.push({
            type: "refunded",
            escrowId: e.key,
            timestamp: "",
            detail: `${e.data?.totalBudget || 0} USDC refunded`,
          });
        }
        return evts;
      })
      .flat();
    setEscrowEvents(events);
  }, [chainState]);

  /* ── Consent decision ── */
  const handleConsent = async (skillId: string, decision: "ACCEPT" | "REJECT") => {
    if (!session?.user?.pseudoId || !stellarAddress) return;
    setConsentLoading(skillId);

    try {
      let txHash: string | undefined;

      if (decision === "ACCEPT") {
        const hash = await freighter.signAndSubmitConsentTx(
          skillId,
          session.user.pseudoId,
          stellarAddress,
          "ACCEPT"
        );
        if (!hash) {
          setConsentLoading(null);
          return;
        }
        txHash = hash;
      }

      await apiFetch("/api/consent/record", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          pseudoId: session.user.pseudoId,
          decision,
          ...(txHash ? { txHash, publicKey: stellarAddress } : {}),
        }),
      });

      // Remove from pending
      setChainState((prev) =>
        prev
          ? {
              ...prev,
              pendingConsent: prev.pendingConsent.filter((c) => c.data?.id !== skillId),
            }
          : prev
      );
    } catch (err) {
      console.error("[dashboard] consent failed:", err);
    } finally {
      setConsentLoading(null);
    }
  };

  /* ── Bot config save ── */
  const handleSaveBot = async () => {
    setBotSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/provider/bot-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stellarAddress,
          openclawUrl: botUrl,
          openclawToken: botToken,
        }),
      });
      if (res.ok) {
        setBotSaved(true);
        setTimeout(() => setBotSaved(false), 3000);
      }
    } catch {
      // silent
    } finally {
      setBotSaving(false);
    }
  };

  /* ── Bot connection test ── */
  const handleTestBot = async () => {
    if (!botUrl) return;
    setBotTesting(true);
    setBotTestResult(null);
    try {
      const res = await fetch(botUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      setBotTestResult(res.ok ? "connected" : `error: ${res.status}`);
    } catch {
      setBotTestResult("unreachable");
    } finally {
      setBotTesting(false);
    }
  };

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
        </div>
      </div>
    );
  }

  /* ── Computed values ── */
  const cs = chainState;
  const totalLocked = cs?.userEscrows.reduce((sum, e) => sum + (e.data?.locked || 0), 0) || 0;
  const totalReleased = cs?.userEscrows.reduce((sum, e) => sum + (e.data?.released || 0), 0) || 0;
  const verifiedProofs = cs?.userProofs.filter((p) => p.data?.status === "verified").length || 0;
  const totalProofs = cs?.userProofs.length || 0;
  const proofSuccessRate = totalProofs > 0 ? (verifiedProofs / totalProofs) * 100 : 0;
  const totalSettlements = cs?.userEscrows.filter((e) => e.data?.status === "released").length || 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 space-y-8">
      {/* ── Header ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="flow-badge">Dashboard</span>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">Dashboard</h1>
          <p className="mt-2 text-sm text-slate-400">
            Welcome,{" "}
            <span className="font-mono text-slate-200">
              {session?.user?.pseudoId?.slice(0, 8)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/buy"
            className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
          >
            Buy Data
          </Link>
          <Link
            href="/sell"
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors"
          >
            Sell Data
          </Link>
          <Link
            href="/marketplace"
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors"
          >
            Marketplace
          </Link>
        </div>
      </div>

      {/* ── On-chain status bar ── */}
      <div
        className={`rounded-lg border px-4 py-2 text-xs ${
          cs?.onChain
            ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-300"
            : "border-amber-500/30 bg-amber-500/5 text-amber-300"
        }`}
      >
        {cs?.onChain ? (
          <>
            On-chain verified — {cs.stellarIndexCount} entries indexed on Stellar (
            <span className="font-mono">{cs.platformAddress?.slice(0, 8)}...</span>
            ). Data resolved via IPFS.
          </>
        ) : (
          <>
            {chainError || "Unable to read on-chain state. Showing cached data."}
          </>
        )}
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Volume</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">
            {(totalLocked + totalReleased).toFixed(2)} USDC
          </p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Programs</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">
            {cs?.summary?.totalSkills || 0}
          </p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Settlements</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{totalSettlements}</p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">Proof Rate</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">
            {proofSuccessRate.toFixed(1)}%
          </p>
        </div>
        <div className="flow-surface rounded-lg p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">On-chain Index</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">
            {cs?.stellarIndexCount || 0}
          </p>
        </div>
      </div>

      {/* ── Pending Consent Notifications ── */}
      {(cs?.pendingConsent?.length || 0) > 0 && (
        <div className="flow-surface rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-300">
              Pending Consent ({cs!.pendingConsent.length})
            </h2>
            <span className="text-xs text-slate-500">
              Accept/reject — data fetched from IPFS via on-chain CID
            </span>
          </div>
          <div className="divide-y divide-slate-800">
            {cs!.pendingConsent.map((task) => (
              <div key={task.data?.id || task.key} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-slate-100 truncate">
                        {task.data?.title || "Untitled Program"}
                      </h3>
                      {task.ipfsResolved && (
                        <span className="shrink-0 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] text-emerald-300">
                          IPFS
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-400">
                      {task.data?.dataSource} | {(task.data?.metrics || []).slice(0, 4).join(", ")} |{" "}
                      <span className="font-medium text-emerald-300">
                        {task.data?.rewardPerUser} USDC/epoch
                      </span>
                    </p>
                    {task.data?.description && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {task.data.description.split("\n")[0]}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                      <span>Duration: {task.data?.durationDays}d</span>
                      <span>Budget: {task.data?.totalBudget} USDC</span>
                      <span>CID: {task.cid.slice(0, 12)}...</span>
                      {task.data?.policy?.maxProofAgeHours != null && (
                        <span>Proof age: {String(task.data.policy.maxProofAgeHours)}h</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={consentLoading !== null}
                      isLoading={consentLoading === task.data?.id}
                      onClick={() => task.data?.id && handleConsent(task.data.id, "ACCEPT")}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={consentLoading !== null}
                      onClick={() => task.data?.id && handleConsent(task.data.id, "REJECT")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid gap-6 xl:grid-cols-3">
        {/* Active Programs (on-chain verified) */}
        <div className="flow-surface rounded-xl xl:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Active Data Programs
            </h2>
            <span className="text-xs text-slate-500">
              Stellar manage_data → IPFS CID → resolved
            </span>
          </div>
          {(cs?.userSkills?.length || 0) === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">
              No active programs on-chain yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {cs!.userSkills.map((skill) => (
                <div key={skill.key} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-100 truncate">
                          {skill.data?.title || skill.key}
                        </p>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] border ${
                            skill.ipfsResolved
                              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                              : "border-slate-600 bg-slate-800 text-slate-400"
                          }`}
                        >
                          {skill.ipfsResolved ? "IPFS verified" : "CID only"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {skill.data?.dataSource || "—"} | {skill.data?.rewardPerUser || 0} USDC/epoch |
                        CID: <span className="font-mono">{skill.cid.slice(0, 16)}...</span>
                      </p>
                    </div>
                    <span className={`flow-status-badge ${skill.data?.status || "active"}`}>
                      {skill.data?.status || "indexed"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* OpenClaw Bot Config */}
        <div className="flow-surface rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
                OpenClaw Bot
              </h2>
              <p className="text-xs text-slate-500">Task delivery & proof pipeline</p>
            </div>
            <button
              onClick={() => setShowBotSetup(!showBotSetup)}
              className="text-xs text-emerald-300 hover:text-emerald-200 transition-colors"
            >
              {showBotSetup ? "Close" : "Configure"}
            </button>
          </div>
          {showBotSetup ? (
            <div className="space-y-3 p-4">
              <div>
                <label className="flow-label-sm">Bot Instance URL</label>
                <input
                  type="url"
                  value={botUrl}
                  onChange={(e) => setBotUrl(e.target.value)}
                  placeholder="https://your-openclaw-instance.com"
                  className="flow-input"
                />
                <p className="mt-1 text-[10px] text-slate-500">
                  Your self-hosted OpenClaw instance. Must expose POST /hooks/agent endpoint.
                </p>
              </div>
              <div>
                <label className="flow-label-sm">API Token</label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="Bearer token for /hooks/agent"
                  className="flow-input"
                />
              </div>
              <div>
                <label className="flow-label-sm">Notification Channel</label>
                <select
                  value={botChannel}
                  onChange={(e) => setBotChannel(e.target.value as typeof botChannel)}
                  className="flow-input"
                >
                  <option value="whatsapp">WhatsApp</option>
                  <option value="telegram">Telegram</option>
                  <option value="discord">Discord</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-500">
                  Channel where OpenClaw forwards consent requests and task notifications.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveBot}
                  disabled={botSaving || !botUrl || !botToken}
                  className="flex-1 rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
                >
                  {botSaving ? "Saving..." : "Save"}
                </button>
                <button
                  onClick={handleTestBot}
                  disabled={botTesting || !botUrl}
                  className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 disabled:opacity-50 transition-colors"
                >
                  {botTesting ? "Testing..." : "Test"}
                </button>
              </div>
              {botSaved && (
                <span className="text-xs text-emerald-300">Saved to IPFS + Stellar.</span>
              )}
              {botTestResult && (
                <span
                  className={`text-xs ${
                    botTestResult === "connected" ? "text-emerald-300" : "text-red-400"
                  }`}
                >
                  {botTestResult === "connected"
                    ? "Bot reachable"
                    : `Connection failed: ${botTestResult}`}
                </span>
              )}
            </div>
          ) : (
            <div className="p-4 space-y-2">
              {cs?.providerStatus?.registered ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-400" />
                    <span className="text-sm text-emerald-300">Provider Active</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Sources: {cs.providerStatus.dataSources?.join(", ") || "—"}
                  </p>
                  {cs.providerStatus.openclawUrl && (
                    <p className="text-xs text-slate-500 font-mono truncate">
                      {cs.providerStatus.openclawUrl}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500">
                  Not registered as provider.{" "}
                  <Link href="/sell" className="text-emerald-300 hover:underline">
                    Set up now
                  </Link>
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Settlement & Proofs ── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Settlement Timeline */}
        <div className="flow-surface rounded-xl">
          <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Settlement Timeline
            </h2>
            <span className="text-xs text-slate-500">70% / 20% / 10% split</span>
          </div>
          {(cs?.userEscrows?.length || 0) === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No settlement records on-chain.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {cs!.userEscrows.slice(0, 6).map((entry) => (
                <div key={entry.key} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-100 truncate">
                        {entry.data?.title || entry.key}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Budget: {entry.data?.totalBudget || 0} USDC | Locked: {entry.data?.locked || 0} |
                        Released: {entry.data?.released || 0}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-600 font-mono">
                        CID: {entry.cid.slice(0, 20)}...
                        {entry.data?.depositTxHash && (
                          <>
                            {" | "}
                            <a
                              href={`https://stellar.expert/explorer/testnet/tx/${entry.data.depositTxHash}`}
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
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] border ${
                          entry.ipfsResolved
                            ? "border-emerald-500/30 text-emerald-300"
                            : "border-slate-600 text-slate-400"
                        }`}
                      >
                        {entry.ipfsResolved ? "IPFS" : "CID"}
                      </span>
                      <span className={`flow-status-badge ${entry.data?.status || "locked"}`}>
                        {entry.data?.status || "indexed"}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proof Ledger */}
        <div className="flow-surface rounded-xl">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Proof Ledger
            </h2>
          </div>
          {(cs?.userProofs?.length || 0) === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No proof records on-chain.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {cs!.userProofs.slice(0, 6).map((proof) => (
                <div
                  key={proof.key}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-sm text-slate-200">
                      {(proof.data?.proofHash || proof.key).slice(0, 16)}...
                    </span>
                    <p className="mt-1 text-xs text-slate-500">
                      {proof.data?.metric || "—"} | {proof.data?.timestamp?.split("T")[0] || "—"}
                    </p>
                    <p className="text-[10px] text-slate-600 font-mono">
                      CID: {proof.cid.slice(0, 16)}...
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] border ${
                        proof.ipfsResolved
                          ? "border-emerald-500/30 text-emerald-300"
                          : "border-slate-600 text-slate-400"
                      }`}
                    >
                      {proof.ipfsResolved ? "IPFS" : "CID"}
                    </span>
                    <span className={`flow-status-badge ${proof.data?.status || "pending"}`}>
                      {proof.data?.status || "indexed"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Escrow Event Stream ── */}
      {escrowEvents.length > 0 && (
        <div className="flow-surface rounded-xl">
          <div className="border-b border-slate-800 px-4 py-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">
              Escrow Event Stream
            </h2>
            <p className="text-[10px] text-slate-500 mt-0.5">
              State transitions from Soroban escrow contract
            </p>
          </div>
          <div className="divide-y divide-slate-800">
            {escrowEvents.slice(0, 10).map((evt, i) => (
              <div key={`${evt.escrowId}-${evt.type}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    evt.type === "deposited"
                      ? "bg-blue-400"
                      : evt.type === "released"
                        ? "bg-emerald-400"
                        : evt.type === "disputed"
                          ? "bg-amber-400"
                          : "bg-slate-400"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-medium text-slate-200">
                    {evt.type.charAt(0).toUpperCase() + evt.type.slice(1)}
                  </span>
                  <span className="ml-2 text-[10px] text-slate-500 font-mono">
                    {evt.escrowId.slice(0, 12)}...
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 shrink-0">{evt.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── On-chain summary ── */}
      {cs?.summary && (
        <div className="flow-surface rounded-xl p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">
            Platform On-chain Index (Stellar manage_data)
          </h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs">
            <div className="rounded-md border border-slate-700 bg-slate-900/40 p-2 text-center">
              <p className="text-slate-500">Skills</p>
              <p className="font-bold text-slate-100">{cs.summary.totalSkills}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/40 p-2 text-center">
              <p className="text-slate-500">Proofs</p>
              <p className="font-bold text-slate-100">{cs.summary.totalProofs}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/40 p-2 text-center">
              <p className="text-slate-500">Providers</p>
              <p className="font-bold text-slate-100">{cs.summary.totalProviders}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/40 p-2 text-center">
              <p className="text-slate-500">Escrows</p>
              <p className="font-bold text-slate-100">{cs.summary.totalEscrows}</p>
            </div>
            <div className="rounded-md border border-slate-700 bg-slate-900/40 p-2 text-center">
              <p className="text-slate-500">MCPs</p>
              <p className="font-bold text-slate-100">{cs.summary.totalMcps}</p>
            </div>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">
            All data is read from Stellar testnet manage_data entries. Each entry contains an IPFS CID that resolves to the full JSON document via Pinata gateway.
          </p>
        </div>
      )}
    </div>
  );
}
