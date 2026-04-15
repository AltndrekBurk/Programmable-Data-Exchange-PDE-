"use client";

/**
 * /agent — Agent Console
 * ─────────────────────
 * The single user-friendly, autonomous, zero-knowledge interface for PDE.
 * Researchers and non-technical users write a plain-English intent; the page
 * shows the full agentic pipeline live:
 *
 *   intent (sanitized) → policy-match → escrow → row-by-row batches
 *   (each with x402 micro-payment + ZK-TLS proof pill) → settled
 *
 * Works standalone: until attestor-core is deployed (CLAUDE.md #1 blocker)
 * the agent simulator drives the UI with the exact same event shapes the real
 * Buyer Agent will emit over Stellar Horizon SSE.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck,
  ShieldAlert,
  Zap,
  Database,
  Lock,
  CheckCircle,
  Circle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Bot,
  RotateCcw,
  Play,
} from "lucide-react";

import { guardIntent, describeWarning, type GuardResult } from "@/lib/promptGuard";
import {
  buildRun,
  intentIdFrom,
  type AgentEvent,
  type PolicyMatchEvent,
  type EscrowLockedEvent,
  type BatchEvent,
  type SettledEvent,
} from "@/lib/agentSim";
import Button from "@/components/ui/Button";

// ─── TYPES ───────────────────────────────────────────────────────────────────

type PipelineStage =
  | "idle"
  | "intent-received"
  | "policy-match"
  | "escrow-locked"
  | "batching"
  | "settled"
  | "error";

interface AgentState {
  stage: PipelineStage;
  policyMatch: PolicyMatchEvent | null;
  escrow: EscrowLockedEvent | null;
  batches: BatchEvent[];
  settled: SettledEvent | null;
  error: string | null;
  events: AgentEvent[];
  runningPaidUsdc: number;
}

const INITIAL_STATE: AgentState = {
  stage: "idle",
  policyMatch: null,
  escrow: null,
  batches: [],
  settled: null,
  error: null,
  events: [],
  runningPaidUsdc: 0,
};

// ─── STAGE METADATA ──────────────────────────────────────────────────────────

const STAGES: { id: PipelineStage; label: string; desc: string }[] = [
  { id: "intent-received", label: "Intent Received", desc: "Sanitized & sandboxed" },
  { id: "policy-match", label: "Policy Match", desc: "Provider found on Stellar" },
  { id: "escrow-locked", label: "Escrow Locked", desc: "USDC held in Soroban" },
  { id: "batching", label: "Row-by-Row Delivery", desc: "x402 + ZK-TLS per batch" },
  { id: "settled", label: "Settled", desc: "3-way escrow release" },
];

const STAGE_ORDER: PipelineStage[] = [
  "idle",
  "intent-received",
  "policy-match",
  "escrow-locked",
  "batching",
  "settled",
];

function stageIndex(s: PipelineStage) {
  return STAGE_ORDER.indexOf(s);
}

// ─── PROMPT INJECTION GUARD BANNER ───────────────────────────────────────────

function GuardBanner({ result }: { result: GuardResult | null }) {
  if (!result) return null;
  if (result.warnings.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">
        <ShieldCheck size={13} />
        <span>Intent clean — no injections detected</span>
      </div>
    );
  }
  return (
    <div className="rounded-md bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-300 space-y-1">
      <div className="flex items-center gap-2 font-semibold">
        <ShieldAlert size={13} />
        Prompt guard applied — {result.warnings.length} issue{result.warnings.length > 1 ? "s" : ""} found
      </div>
      <ul className="pl-4 space-y-0.5 text-amber-400/80">
        {result.warnings.map((w) => (
          <li key={w}>• {describeWarning(w)}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── ZK-TLS PROOF PILL ───────────────────────────────────────────────────────

function ProofPill({ status }: { status: "verified" | "simulated" }) {
  if (status === "verified") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
        <ShieldCheck size={10} />
        ZK-TLS Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-semibold text-amber-400 uppercase tracking-wide">
      <FlaskConical size={10} />
      Simulated
    </span>
  );
}

// ─── PIPELINE STEP ───────────────────────────────────────────────────────────

function PipelineStep({
  stage,
  currentStage,
  label,
  desc,
}: {
  stage: PipelineStage;
  currentStage: PipelineStage;
  label: string;
  desc: string;
}) {
  const curr = stageIndex(currentStage);
  const mine = stageIndex(stage);
  const done = curr > mine;
  const active = curr === mine;

  return (
    <div className="flex items-start gap-3 min-w-0">
      <div className="relative mt-0.5 shrink-0">
        {done ? (
          <CheckCircle size={18} className="text-emerald-400" />
        ) : active ? (
          <div className="relative flex h-[18px] w-[18px] items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex h-[10px] w-[10px] rounded-full bg-emerald-400" />
          </div>
        ) : (
          <Circle size={18} className="text-slate-700" />
        )}
      </div>
      <div className="min-w-0">
        <div
          className={`text-sm font-semibold truncate ${
            done ? "text-emerald-400" : active ? "text-white" : "text-slate-600"
          }`}
        >
          {label}
        </div>
        <div className="text-xs text-slate-500 truncate">{desc}</div>
      </div>
    </div>
  );
}

// ─── BATCH ROW ───────────────────────────────────────────────────────────────

function BatchRow({
  batch,
  researcher,
}: {
  batch: BatchEvent;
  researcher: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="rounded-lg border border-slate-800 bg-slate-900/50"
    >
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/* Index */}
        <span className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-slate-800 text-xs font-mono font-bold text-slate-400">
          {batch.index}
        </span>

        {/* Core info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-white">
              {batch.rowCount} rows
            </span>
            <ProofPill status={batch.proofStatus} />
            <span className="text-xs text-slate-500">{batch.latencyMs}ms</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-slate-500 font-mono">
              x402: <span className="text-amber-400 font-semibold">{batch.x402CostUsdc} USDC</span>
            </span>
            <span className="text-xs text-slate-600">
              ∑ {batch.runningPaidUsdc} USDC
            </span>
          </div>
        </div>

        {/* Expand icon */}
        {researcher && (
          <div className="shrink-0 text-slate-600">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </div>
        )}
      </button>

      {researcher && open && (
        <div className="border-t border-slate-800 px-4 py-3 space-y-2">
          <ResearchField label="Proof Hash" value={batch.proofHash} mono />
          <ResearchField label="IPFS CID" value={batch.cid} mono />
          <ResearchField label="Stellar TX" value={batch.txHash} mono />
          <ResearchField
            label="Raw Event"
            value={JSON.stringify(
              {
                type: batch.type,
                index: batch.index,
                rowCount: batch.rowCount,
                proofStatus: batch.proofStatus,
                x402CostUsdc: batch.x402CostUsdc,
                cid: batch.cid,
                txHash: batch.txHash,
              },
              null,
              2
            )}
            mono
            block
          />
        </div>
      )}
    </motion.div>
  );
}

// ─── RESEARCH FIELD ──────────────────────────────────────────────────────────

function ResearchField({
  label,
  value,
  mono = false,
  block = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
  block?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-0.5">{label}</div>
      {block ? (
        <pre className="text-[10px] font-mono text-slate-400 bg-slate-950 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
          {value}
        </pre>
      ) : (
        <div
          className={`text-xs break-all ${mono ? "font-mono text-slate-400" : "text-slate-300"}`}
        >
          {value}
        </div>
      )}
    </div>
  );
}

// ─── STAT CARD ───────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "emerald" | "amber" | "cyan";
}) {
  const colors = {
    default: "text-slate-300",
    emerald: "text-emerald-400",
    amber: "text-amber-400",
    cyan: "text-cyan-400",
  };
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3 flex items-start gap-3">
      <div className="mt-0.5 shrink-0 text-slate-600">
        <Icon size={16} />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-600 mb-0.5">{label}</div>
        <div className={`text-sm font-bold font-mono ${colors[tone]}`}>{value}</div>
        {sub && <div className="text-[10px] text-slate-600 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function AgentConsolePage() {
  const [intent, setIntent] = useState("");
  const [guard, setGuard] = useState<GuardResult | null>(null);
  const [agentState, setAgentState] = useState<AgentState>(INITIAL_STATE);
  const [researcher, setResearcher] = useState(false);
  const [budget] = useState(5);
  const [batchCount] = useState(6);
  const [rowsPerBatch] = useState(10);
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const streamRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll batch stream.
  useEffect(() => {
    if (streamRef.current && agentState.batches.length > 0) {
      streamRef.current.scrollTo({
        top: streamRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [agentState.batches.length]);

  // Sanitize on every keystroke.
  useEffect(() => {
    if (!intent.trim()) {
      setGuard(null);
      return;
    }
    setGuard(guardIntent(intent));
  }, [intent]);

  const clearTimers = useCallback(() => {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
  }, []);

  const reset = useCallback(() => {
    clearTimers();
    setAgentState(INITIAL_STATE);
    setGuard(null);
    setIntent("");
  }, [clearTimers]);

  const run = useCallback(() => {
    if (!intent.trim()) return;
    const guardResult = guardIntent(intent);
    if (guardResult.blocked) return;

    clearTimers();
    setAgentState(INITIAL_STATE);

    const intentId = intentIdFrom(intent);
    const events = buildRun({
      intentId,
      guardWarnings: guardResult.warnings.map(String),
      budgetUsdc: budget,
      batchCount,
      rowsPerBatch,
      tickMs: 1400,
    });

    // Schedule each event onto a timer so the UI animates one-by-one.
    const base = Date.now();
    events.forEach((ev) => {
      const delay = Math.max(0, ev.at - base);
      const t = setTimeout(() => {
        setAgentState((prev) => {
          const next = { ...prev, events: [...prev.events, ev] };
          switch (ev.type) {
            case "intent-received":
              return { ...next, stage: "intent-received" };
            case "policy-match":
              return { ...next, stage: "policy-match", policyMatch: ev };
            case "escrow-locked":
              return { ...next, stage: "escrow-locked", escrow: ev };
            case "batch":
              return {
                ...next,
                stage: "batching",
                batches: [...prev.batches, ev],
                runningPaidUsdc: ev.runningPaidUsdc,
              };
            case "settled":
              return { ...next, stage: "settled", settled: ev };
            case "error":
              return { ...next, stage: "error", error: ev.message };
          }
        });
      }, delay);
      timerRef.current.push(t);
    });
  }, [intent, budget, batchCount, rowsPerBatch, clearTimers]);

  const isRunning =
    agentState.stage !== "idle" && agentState.stage !== "settled" && agentState.stage !== "error";
  const canRun = !!intent.trim() && !guard?.blocked && !isRunning;

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen">
      {/* ── Header bar ── */}
      <div className="border-b border-slate-800 bg-slate-950/80 backdrop-blur sticky top-0 z-30 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 border border-emerald-500/30">
              <Bot size={16} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-white">Agent Console</h1>
              <p className="text-[10px] text-slate-500 font-mono leading-none">
                autonomous · zero-knowledge · row-by-row · x402
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Researcher Mode toggle */}
            <button
              onClick={() => setResearcher((p) => !p)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                researcher
                  ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300"
                  : "border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200"
              }`}
            >
              <FlaskConical size={12} />
              Researcher Mode
            </button>

            {/* Attestor status */}
            <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-900/40 px-3 py-1.5 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Attestor: Simulated
            </div>
          </div>
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="max-w-7xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* ── LEFT: composer + pipeline + batch stream ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Intent Composer */}
          <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 flex items-center justify-center rounded bg-emerald-500/20">
                <Zap size={11} className="text-emerald-400" />
              </div>
              <h2 className="text-sm font-bold text-white">What data do you need?</h2>
              <span className="text-[10px] text-slate-600 ml-auto font-mono">
                {intent.length}/2000
              </span>
            </div>

            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder={
                `Examples:\n` +
                `• "30 days of my Fitbit sleep data — just sleep score and duration"\n` +
                `• "Monthly Strava running totals for the past 3 months"\n` +
                `• "Last 90 days of steps and heart-rate from Google Fit"`
              }
              rows={5}
              maxLength={2200}
              disabled={isRunning}
              className="w-full resize-none rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:opacity-50 font-sans leading-relaxed"
            />

            {/* Guard banner */}
            <GuardBanner result={guard} />

            {/* Config hint */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <span>Budget: <span className="text-slate-400 font-mono">{budget} USDC</span></span>
              <span>Batches: <span className="text-slate-400 font-mono">{batchCount}</span></span>
              <span>Rows/batch: <span className="text-slate-400 font-mono">{rowsPerBatch}</span></span>
              <span>x402/row: <span className="text-slate-400 font-mono">0.05 USDC</span></span>
            </div>

            {/* CTA row */}
            <div className="flex items-center gap-3">
              <Button
                onClick={run}
                disabled={!canRun}
                isLoading={isRunning}
                size="lg"
                className="flex items-center gap-2"
              >
                <Play size={14} />
                {isRunning ? "Agent running…" : "Run Agent"}
              </Button>

              {agentState.stage !== "idle" && (
                <Button variant="ghost" size="md" onClick={reset}>
                  <RotateCcw size={13} className="mr-1" />
                  Reset
                </Button>
              )}
            </div>
          </section>

          {/* Pipeline stages */}
          {agentState.stage !== "idle" && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
            >
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-5">
                Pipeline
              </h2>
              <div className="flex flex-col gap-4">
                {STAGES.map((s) => (
                  <PipelineStep
                    key={s.id}
                    stage={s.id}
                    currentStage={agentState.stage}
                    label={s.label}
                    desc={s.desc}
                  />
                ))}
              </div>

              {/* Settled summary */}
              <AnimatePresence>
                {agentState.settled && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4"
                  >
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm mb-3">
                      <CheckCircle size={15} />
                      Delivery Complete — Escrow Released
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-xs">
                      <div>
                        <div className="text-slate-500 mb-0.5">Provider (70%)</div>
                        <div className="font-mono font-bold text-emerald-400">
                          {agentState.settled.providerShareUsdc} USDC
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-0.5">Platform (20%)</div>
                        <div className="font-mono font-bold text-slate-300">
                          {agentState.settled.platformShareUsdc} USDC
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500 mb-0.5">Dispute Pool (10%)</div>
                        <div className="font-mono font-bold text-slate-300">
                          {agentState.settled.disputeShareUsdc} USDC
                        </div>
                      </div>
                    </div>
                    {researcher && (
                      <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
                        <ResearchField label="Settlement TX" value={agentState.settled.txHash} mono />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Error state */}
              {agentState.error && (
                <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 flex items-center gap-2 text-red-400 text-sm">
                  <AlertTriangle size={14} />
                  {agentState.error}
                </div>
              )}
            </motion.section>
          )}

          {/* Batch stream */}
          {agentState.batches.length > 0 && (
            <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Row-by-Row Delivery
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Database size={11} />
                  {agentState.batches.length} / {agentState.policyMatch?.estimatedBatches ?? "?"} batches
                </div>
              </div>

              <div
                ref={streamRef}
                className="space-y-2 max-h-[480px] overflow-y-auto pr-1 scroll-smooth"
              >
                {agentState.batches.map((b) => (
                  <BatchRow key={b.index} batch={b} researcher={researcher} />
                ))}
              </div>

              {/* x402 running total ticker */}
              <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-3 text-xs">
                <span className="text-slate-600">Running x402 total</span>
                <span className="font-mono font-bold text-amber-400">
                  {agentState.runningPaidUsdc.toFixed(4)} USDC
                </span>
              </div>
            </section>
          )}

          {/* Researcher: all raw events */}
          {researcher && agentState.events.length > 0 && (
            <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5">
              <h2 className="text-xs font-semibold text-cyan-500 uppercase tracking-wide mb-4 flex items-center gap-2">
                <FlaskConical size={12} />
                Raw Event Log
              </h2>
              <pre className="text-[10px] font-mono text-cyan-300/70 bg-slate-950/60 rounded-xl p-4 overflow-x-auto max-h-80 whitespace-pre-wrap break-all">
                {JSON.stringify(agentState.events, null, 2)}
              </pre>
            </section>
          )}
        </div>

        {/* ── RIGHT: live stats + guard details ── */}
        <div className="space-y-5">

          {/* How it works (idle) */}
          {agentState.stage === "idle" && (
            <motion.section
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 space-y-4"
            >
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                How it works
              </h2>
              <div className="space-y-4 text-sm text-slate-400 leading-relaxed">
                <Step n={1} color="emerald">
                  Write what data you need in plain English. No protocol jargon.
                </Step>
                <Step n={2} color="emerald">
                  Your intent is sanitized (zero-width chars, role tokens, jailbreak phrases
                  stripped) before any agent sees it.
                </Step>
                <Step n={3} color="cyan">
                  A Seller Agent on Stellar matches your request to their policy and sends a
                  consent transaction.
                </Step>
                <Step n={4} color="cyan">
                  USDC is locked in a Soroban escrow smart-contract — neither side can run
                  with the money.
                </Step>
                <Step n={5} color="amber">
                  Data arrives row-by-row. Each batch carries a ZK-TLS proof (attestor-signed
                  or simulated). A micro x402 payment releases automatically when the proof
                  checks out.
                </Step>
                <Step n={6} color="amber">
                  After all batches: 70% to provider, 20% platform, 10% dispute pool.
                  No raw data ever touches the server.
                </Step>
              </div>
            </motion.section>
          )}

          {/* Live stats (running / done) */}
          {agentState.stage !== "idle" && (
            <motion.section
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
                Live Stats
              </h2>

              <StatCard
                icon={Bot}
                label="Provider"
                value={
                  agentState.policyMatch
                    ? agentState.policyMatch.provider.slice(0, 6) +
                      "…" +
                      agentState.policyMatch.provider.slice(-4)
                    : "—"
                }
                sub={
                  agentState.policyMatch
                    ? `Match score ${(agentState.policyMatch.matchScore * 100).toFixed(0)}%`
                    : "Searching…"
                }
                tone="cyan"
              />

              <StatCard
                icon={Lock}
                label="Escrow"
                value={agentState.escrow ? `${agentState.escrow.amountUsdc} USDC` : "—"}
                sub={
                  agentState.escrow
                    ? "Locked in Soroban"
                    : agentState.stage === "policy-match"
                    ? "Locking…"
                    : "Awaiting policy"
                }
                tone="emerald"
              />

              <StatCard
                icon={Database}
                label="Rows Received"
                value={String(agentState.batches.reduce((a, b) => a + b.rowCount, 0))}
                sub={`${agentState.batches.length} / ${agentState.policyMatch?.estimatedBatches ?? "?"} batches`}
                tone="default"
              />

              <StatCard
                icon={Zap}
                label="x402 Paid"
                value={`${agentState.runningPaidUsdc.toFixed(4)} USDC`}
                sub="Micro-payments per batch"
                tone="amber"
              />

              <StatCard
                icon={ShieldCheck}
                label="Proofs Verified"
                value={String(agentState.batches.length)}
                sub={`${agentState.batches.filter((b) => b.proofStatus === "verified").length} real / ${agentState.batches.filter((b) => b.proofStatus === "simulated").length} simulated`}
                tone={
                  agentState.batches.every((b) => b.proofStatus === "verified")
                    ? "emerald"
                    : "amber"
                }
              />

              <StatCard
                icon={CheckCircle}
                label="Avg Latency"
                value={
                  agentState.batches.length > 0
                    ? `${Math.round(
                        agentState.batches.reduce((a, b) => a + b.latencyMs, 0) /
                          agentState.batches.length
                      )}ms`
                    : "—"
                }
                sub="Per batch settlement"
              />
            </motion.section>
          )}

          {/* Guard panel (always) */}
          {researcher && guard && (
            <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-3">
              <h2 className="text-xs font-semibold text-cyan-500 uppercase tracking-wide flex items-center gap-2">
                <ShieldCheck size={12} />
                Prompt Guard — Researcher View
              </h2>
              <ResearchField
                label="Original length"
                value={`${guard.originalLength} chars`}
              />
              <ResearchField
                label="Cleaned length"
                value={`${guard.cleaned.length} chars`}
              />
              <ResearchField label="Blocked" value={guard.blocked ? "YES" : "No"} />
              <ResearchField
                label="Warnings"
                value={guard.warnings.length ? guard.warnings.join(", ") : "none"}
              />
              <ResearchField label="Cleaned text" value={guard.cleaned || "(empty)"} />
              <ResearchField label="Sandbox-wrapped (sent to agent)" value={guard.wrapped} mono block />
            </section>
          )}

          {/* Attestor note */}
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-400/80 leading-relaxed">
            <span className="font-semibold text-amber-400">Attestor-core not yet deployed.</span>{" "}
            ZK-TLS proofs are simulated. Real proofs require a self-hosted{" "}
            <code className="font-mono">attestor-core</code> node — see{" "}
            <span className="underline underline-offset-2">CLAUDE.md</span> for deploy steps.
            All payment logic and escrow is real on Stellar testnet.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── STEP helper ─────────────────────────────────────────────────────────────

function Step({
  n,
  color,
  children,
}: {
  n: number;
  color: "emerald" | "cyan" | "amber";
  children: React.ReactNode;
}) {
  const c = {
    emerald: "bg-emerald-500/20 text-emerald-400",
    cyan: "bg-cyan-500/20 text-cyan-400",
    amber: "bg-amber-500/20 text-amber-400",
  }[color];

  return (
    <div className="flex items-start gap-3">
      <span
        className={`shrink-0 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${c}`}
      >
        {n}
      </span>
      <span className="text-slate-400 text-xs leading-relaxed">{children}</span>
    </div>
  );
}
