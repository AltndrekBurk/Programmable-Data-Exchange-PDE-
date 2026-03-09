// ---------------------------------------------------------------------------
// Frontend-direct chain reader — reads Stellar + IPFS without backend
//
// dApp principle: ALL reads go directly to Horizon RPC + IPFS gateway.
// Backend is NEVER needed for reading on-chain or IPFS data.
// ---------------------------------------------------------------------------

import { readAccountData, PREFIXES } from "./stellar";
import { fetchFromIpfs } from "./ipfs";

const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://gateway.pinata.cloud";

/** Platform Stellar address — public, safe to expose */
export function getPlatformAddress(): string | null {
  return (
    process.env.NEXT_PUBLIC_STELLAR_PLATFORM_PUBLIC ||
    process.env.NEXT_PUBLIC_PLATFORM_STELLAR_ADDRESS ||
    null
  );
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface ChainEntry<T = unknown> {
  key: string;
  cid: string;
  data?: T;
  ipfsResolved: boolean;
}

export interface SkillData {
  id?: string;
  title?: string;
  description?: string;
  dataSource?: string;
  metrics?: string[];
  rewardPerUser?: number;
  durationDays?: number;
  totalBudget?: number;
  targetCount?: number;
  callbackUrl?: string;
  deliveryPublicKey?: string;
  policy?: Record<string, unknown>;
  status?: string;
  createdAt?: string;
  mcpId?: string;
}

export interface EscrowData {
  id?: string;
  skillId?: string;
  title?: string;
  totalBudget?: number;
  locked?: number;
  released?: number;
  providerShare?: number;
  platformShare?: number;
  disputePool?: number;
  status?: "locked" | "releasing" | "released" | "disputed" | "refunded";
  depositor?: string;
  depositorAddress?: string;
  depositTxHash?: string;
  createdAt?: string;
}

export interface ProofData {
  proofHash?: string;
  skillId?: string;
  providerPseudoId?: string;
  metric?: string;
  status?: "verified" | "failed" | "pending";
  timestamp?: string;
}

export interface ProviderData {
  id?: string;
  stellarAddress?: string;
  dataSources?: string[];
  policy?: Record<string, unknown>;
  openclawUrl?: string;
  status?: string;
}

export interface McpData {
  id?: string;
  title?: string;
  description?: string;
  dataSource?: string;
  metrics?: string[];
  creator?: string;
  usageCount?: number;
  rating?: number;
  ipfsHash?: string;
  proofType?: string;
  freshnessSlaHours?: number;
  minWitnessCount?: number;
  deliveryFormat?: string;
  schemaVersion?: string;
}

// ── Core reader ────────────────────────────────────────────────────────────

export interface CategorizedEntries {
  skills: { key: string; cid: string }[];
  proofs: { key: string; cid: string }[];
  providers: { key: string; cid: string }[];
  escrows: { key: string; cid: string }[];
  mcps: { key: string; cid: string }[];
  volumes: { key: string; value: string }[];
  totalEntries: number;
}

/**
 * Read and categorize all manage_data entries from an account.
 * Direct Horizon call — no backend needed.
 */
export async function readAndCategorize(
  address: string
): Promise<CategorizedEntries> {
  const accountData = await readAccountData(address);

  const result: CategorizedEntries = {
    skills: [],
    proofs: [],
    providers: [],
    escrows: [],
    mcps: [],
    volumes: [],
    totalEntries: accountData.size,
  };

  for (const [key, value] of accountData) {
    if (!value) continue;
    if (key.startsWith(PREFIXES.skill)) result.skills.push({ key, cid: value });
    else if (key.startsWith(PREFIXES.proof)) result.proofs.push({ key, cid: value });
    else if (key.startsWith(PREFIXES.provider)) result.providers.push({ key, cid: value });
    else if (key.startsWith(PREFIXES.escrow)) result.escrows.push({ key, cid: value });
    else if (key.startsWith(PREFIXES.mcp)) result.mcps.push({ key, cid: value });
    else if (key.startsWith("mv:")) result.volumes.push({ key, value });
  }

  return result;
}

/**
 * Resolve IPFS CIDs to JSON data, with timeout protection.
 * Returns entries with `data` populated where successful.
 */
export async function resolveIpfsBatch<T>(
  entries: { key: string; cid: string }[],
  limit = 10,
  timeoutMs = 5000
): Promise<ChainEntry<T>[]> {
  return Promise.all(
    entries.slice(0, limit).map(async (entry) => {
      try {
        const url = `${PINATA_GATEWAY}/ipfs/${entry.cid}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          const data = (await res.json()) as T;
          return { ...entry, data, ipfsResolved: true };
        }
      } catch {
        // timeout or error — return unresolved
      }
      return { ...entry, data: undefined, ipfsResolved: false };
    })
  );
}

// ── Dashboard state ────────────────────────────────────────────────────────

export interface DashboardChainState {
  onChain: boolean;
  platformAddress: string;
  stellarIndexCount: number;
  summary: {
    totalSkills: number;
    totalProofs: number;
    totalProviders: number;
    totalEscrows: number;
    totalMcps: number;
  };
  userSkills: ChainEntry<SkillData>[];
  userEscrows: ChainEntry<EscrowData>[];
  userProofs: ChainEntry<ProofData>[];
  pendingConsent: ChainEntry<SkillData>[];
  providerStatus: {
    registered: boolean;
    cid?: string;
    dataSources?: string[];
    policy?: Record<string, unknown>;
    openclawUrl?: string;
    status?: string;
  };
}

/**
 * Read full dashboard state directly from Stellar Horizon + IPFS.
 * No backend call needed — true dApp pattern.
 */
export async function readDashboardState(
  pseudoId: string,
  stellarAddress: string
): Promise<DashboardChainState> {
  const platformAddress = getPlatformAddress();
  if (!platformAddress) {
    throw new Error("NEXT_PUBLIC_STELLAR_PLATFORM_PUBLIC not configured");
  }

  // Step 1: Read all manage_data directly from Horizon
  const categorized = await readAndCategorize(platformAddress);

  // Step 2: Resolve IPFS for skills
  const resolvedSkills = await resolveIpfsBatch<SkillData>(
    categorized.skills,
    10
  );

  // Step 3: Resolve IPFS for escrows, filter by user
  const resolvedEscrows = await resolveIpfsBatch<EscrowData>(
    categorized.escrows,
    10
  );
  const userEscrows = resolvedEscrows.filter(
    (e) =>
      e.data?.depositor === pseudoId ||
      e.data?.depositorAddress === stellarAddress
  );

  // Step 4: Resolve provider record for this user
  const userProviderKey = `${PREFIXES.provider}${pseudoId.slice(0, 24)}`;
  const providerEntry = categorized.providers.find(
    (p) => p.key === userProviderKey
  );
  let providerData: ProviderData | null = null;
  if (providerEntry) {
    try {
      providerData = await fetchFromIpfs<ProviderData>(providerEntry.cid);
    } catch {
      // skip
    }
  }

  // Step 5: Find pending consent tasks
  const pendingConsent = resolvedSkills.filter((s) => {
    if (!s.data) return false;
    if (s.data.status !== "active") return false;
    if (providerData?.dataSources?.length) {
      return providerData.dataSources.some(
        (ds) => ds.toLowerCase() === s.data?.dataSource?.toLowerCase()
      );
    }
    return true;
  });

  // Step 6: Resolve proofs, filter by user
  const resolvedProofs = await resolveIpfsBatch<ProofData>(
    categorized.proofs,
    10
  );
  const userProofs = resolvedProofs.filter(
    (p) => p.data?.providerPseudoId === pseudoId
  );

  return {
    onChain: true,
    platformAddress,
    stellarIndexCount: categorized.totalEntries,
    summary: {
      totalSkills: categorized.skills.length,
      totalProofs: categorized.proofs.length,
      totalProviders: categorized.providers.length,
      totalEscrows: categorized.escrows.length,
      totalMcps: categorized.mcps.length,
    },
    userSkills: resolvedSkills,
    userEscrows,
    userProofs,
    pendingConsent,
    providerStatus: providerData
      ? {
          registered: true,
          cid: providerEntry?.cid,
          dataSources: providerData.dataSources,
          policy: providerData.policy,
          openclawUrl: providerData.openclawUrl,
          status: providerData.status,
        }
      : { registered: false },
  };
}

// ── Escrow list (frontend-direct) ──────────────────────────────────────────

/**
 * Read escrow entries directly from chain + IPFS.
 * Filters by user address or pseudoId.
 */
export async function readUserEscrows(
  pseudoId: string,
  stellarAddress: string
): Promise<ChainEntry<EscrowData>[]> {
  const platformAddress = getPlatformAddress();
  if (!platformAddress) return [];

  const categorized = await readAndCategorize(platformAddress);
  const resolved = await resolveIpfsBatch<EscrowData>(
    categorized.escrows,
    20
  );

  return resolved.filter(
    (e) =>
      e.data?.depositor === pseudoId ||
      e.data?.depositorAddress === stellarAddress
  );
}

// ── Proof list (frontend-direct) ───────────────────────────────────────────

/**
 * Read proof entries directly from chain + IPFS.
 * Filters by user pseudoId.
 */
export async function readUserProofs(
  pseudoId: string
): Promise<ChainEntry<ProofData>[]> {
  const platformAddress = getPlatformAddress();
  if (!platformAddress) return [];

  const categorized = await readAndCategorize(platformAddress);
  const resolved = await resolveIpfsBatch<ProofData>(categorized.proofs, 20);

  return resolved.filter((p) => p.data?.providerPseudoId === pseudoId);
}

// ── Skill / task list (frontend-direct) ────────────────────────────────────

/**
 * Read all active skills from chain + IPFS.
 * For providers to see available tasks.
 */
export async function readActiveSkills(): Promise<ChainEntry<SkillData>[]> {
  const platformAddress = getPlatformAddress();
  if (!platformAddress) return [];

  const categorized = await readAndCategorize(platformAddress);
  return resolveIpfsBatch<SkillData>(categorized.skills, 50);
}

// ── MCP / marketplace list (frontend-direct) ───────────────────────────────

export interface McpWithVolume extends McpData {
  volume?: number;
}

/**
 * Read MCP standards from chain + IPFS with volume data.
 * Same pattern as marketplace/page.tsx but reusable.
 */
export async function readMarketplaceMcps(): Promise<
  ChainEntry<McpWithVolume>[]
> {
  const platformAddress = getPlatformAddress();
  if (!platformAddress) return [];

  const categorized = await readAndCategorize(platformAddress);
  const volumeMap = new Map<string, number>();
  for (const v of categorized.volumes) {
    const parsed = parseFloat(v.value);
    if (Number.isFinite(parsed)) {
      volumeMap.set(v.key.slice(3), parsed);
    }
  }

  const resolved = await resolveIpfsBatch<McpData>(categorized.mcps, 50);

  return resolved.map((entry) => {
    const mcpId = entry.key.slice(PREFIXES.mcp.length);
    const volume = volumeMap.get(mcpId.slice(0, 24));
    return {
      ...entry,
      data: entry.data ? { ...entry.data, volume } : undefined,
    };
  });
}

/**
 * Read a single MCP by its chain key suffix (id).
 * Resolves directly from IPFS via the CID on-chain.
 */
export async function readMcpById(
  mcpId: string
): Promise<ChainEntry<McpData> | null> {
  const platformAddress = getPlatformAddress();
  if (!platformAddress) return null;

  const accountData = await readAccountData(platformAddress);
  const key = `${PREFIXES.mcp}${mcpId.replace(/-/g, "").slice(0, 24)}`;

  const cid = accountData.get(key);
  if (!cid) return null;

  try {
    const data = await fetchFromIpfs<McpData>(cid);
    return { key, cid, data, ipfsResolved: true };
  } catch {
    return { key, cid, ipfsResolved: false };
  }
}
