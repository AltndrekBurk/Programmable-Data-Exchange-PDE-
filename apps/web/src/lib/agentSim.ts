/**
 * agentSim
 * --------
 * Produces the event timeline a real PDE Buyer Agent will emit while running
 * an intent end-to-end:
 *
 *   intent-received → policy-match → escrow-locked
 *                   → batch (×N, row-by-row with x402 micropayment + ZK-TLS proof)
 *                   → settled
 *
 * The real agent (see AGENT.md / FLOW.md) will emit the same shapes over SSE
 * from Horizon. Until attestor-core is deployed (the #1 blocker in CLAUDE.md)
 * this simulator drives the UI, so researchers can see exactly what the
 * autonomous flow will look like without waiting on infra.
 *
 * Every event is deterministic-ish (seeded by intent hash) so researchers
 * can compare runs.
 */

export type AgentEvent =
  | IntentReceivedEvent
  | PolicyMatchEvent
  | EscrowLockedEvent
  | BatchEvent
  | SettledEvent
  | ErrorEvent;

export interface IntentReceivedEvent {
  type: "intent-received";
  at: number;
  intentId: string;
  wrappedChars: number;
  guardWarnings: string[];
}

export interface PolicyMatchEvent {
  type: "policy-match";
  at: number;
  provider: string;
  policyCid: string;
  matchScore: number;
  estimatedRows: number;
  estimatedBatches: number;
  estimatedTotalUsdc: number;
}

export interface EscrowLockedEvent {
  type: "escrow-locked";
  at: number;
  amountUsdc: number;
  txHash: string;
  contractId: string;
}

export interface BatchEvent {
  type: "batch";
  at: number;
  index: number;        // 1-based
  total: number;
  rowCount: number;
  x402CostUsdc: number;
  runningPaidUsdc: number;
  proofStatus: "verified" | "simulated";
  proofHash: string;
  cid: string;
  txHash: string;
  latencyMs: number;
}

export interface SettledEvent {
  type: "settled";
  at: number;
  totalRows: number;
  totalPaidUsdc: number;
  providerShareUsdc: number;
  platformShareUsdc: number;
  disputeShareUsdc: number;
  txHash: string;
}

export interface ErrorEvent {
  type: "error";
  at: number;
  message: string;
}

export interface RunConfig {
  intentId: string;
  guardWarnings: string[];
  budgetUsdc: number;
  batchCount: number;
  rowsPerBatch: number;
  tickMs: number;
}

/** Deterministic-ish pseudo hash for display-only ids. */
function fakeHash(seed: string, salt: string, len = 12): string {
  let h = 2166136261;
  const s = seed + "|" + salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  // Pad up by hashing again.
  let out = hex;
  let round = 0;
  while (out.length < len) {
    let h2 = h ^ round++;
    h2 = Math.imul(h2, 16777619);
    out += (h2 >>> 0).toString(16).padStart(8, "0");
  }
  return out.slice(0, len);
}

function txHash(seed: string, salt: string): string {
  return fakeHash(seed, salt, 16).toUpperCase();
}

function cid(seed: string, salt: string): string {
  return "bafy" + fakeHash(seed, salt, 44);
}

/**
 * Produces the full ordered event list for a run. The UI schedules these
 * onto a timer — it does not mutate them.
 */
export function buildRun(cfg: RunConfig): AgentEvent[] {
  const events: AgentEvent[] = [];
  const t0 = Date.now();
  const seed = cfg.intentId;

  events.push({
    type: "intent-received",
    at: t0,
    intentId: cfg.intentId,
    wrappedChars: 0,
    guardWarnings: cfg.guardWarnings,
  });

  const estimatedRows = cfg.batchCount * cfg.rowsPerBatch;
  events.push({
    type: "policy-match",
    at: t0 + 1 * cfg.tickMs,
    provider: "G" + fakeHash(seed, "provider", 55).toUpperCase(),
    policyCid: cid(seed, "policy"),
    matchScore: 0.92,
    estimatedRows,
    estimatedBatches: cfg.batchCount,
    estimatedTotalUsdc: Math.min(cfg.budgetUsdc, cfg.batchCount * 0.05 * cfg.rowsPerBatch),
  });

  events.push({
    type: "escrow-locked",
    at: t0 + 2 * cfg.tickMs,
    amountUsdc: cfg.budgetUsdc,
    txHash: txHash(seed, "escrow"),
    contractId: "C" + fakeHash(seed, "contract", 55).toUpperCase(),
  });

  const perRowUsdc = 0.05;
  let runningPaid = 0;
  for (let i = 1; i <= cfg.batchCount; i++) {
    const cost = +(perRowUsdc * cfg.rowsPerBatch).toFixed(4);
    runningPaid = +(runningPaid + cost).toFixed(4);
    events.push({
      type: "batch",
      at: t0 + (2 + i) * cfg.tickMs,
      index: i,
      total: cfg.batchCount,
      rowCount: cfg.rowsPerBatch,
      x402CostUsdc: cost,
      runningPaidUsdc: runningPaid,
      proofStatus: "simulated", // flip to "verified" once attestor-core is live
      proofHash: fakeHash(seed, "proof-" + i, 32),
      cid: cid(seed, "batch-" + i),
      txHash: txHash(seed, "batch-" + i),
      latencyMs: 1800 + ((i * 137) % 600),
    });
  }

  const total = +(runningPaid).toFixed(4);
  events.push({
    type: "settled",
    at: t0 + (3 + cfg.batchCount) * cfg.tickMs,
    totalRows: estimatedRows,
    totalPaidUsdc: total,
    providerShareUsdc: +(total * 0.7).toFixed(4),
    platformShareUsdc: +(total * 0.2).toFixed(4),
    disputeShareUsdc: +(total * 0.1).toFixed(4),
    txHash: txHash(seed, "settle"),
  });

  return events;
}

/** Small deterministic id from raw intent text. */
export function intentIdFrom(text: string): string {
  return "intent_" + fakeHash(text, "id", 12);
}
