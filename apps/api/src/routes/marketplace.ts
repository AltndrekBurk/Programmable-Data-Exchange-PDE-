import { writeIndexEntry, readAccountData } from '@pde/stellar'
import { uploadJson } from '@pde/ipfs'
import { Keypair } from '@stellar/stellar-sdk'
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { generatePseudonym } from "@pde/pseudonym";
import type { StorageService, StoredMcpStandard } from "@pde/storage";

function parseOnChainUsdcVolume(raw: string): number | null {
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : null
}

async function loadOnChainVolumeIndex(platformAddress?: string): Promise<Map<string, number>> {
  const index = new Map<string, number>()
  if (!platformAddress) return index

  try {
    const accountData = await readAccountData(platformAddress)
    for (const [key, value] of accountData) {
      if (!key.startsWith('mv:')) continue
      const mcpPrefix = key.slice(3)
      const parsed = parseOnChainUsdcVolume(value)
      if (parsed === null) continue
      index.set(mcpPrefix, parsed)
    }
  } catch (err) {
    console.warn('[marketplace] On-chain volume read failed:', err)
  }

  return index
}

function mergeOnChainVolume(
  mcp: StoredMcpStandard,
  onChainIndex: Map<string, number>
): StoredMcpStandard {
  const chainVolume = onChainIndex.get(mcp.id.slice(0, 24))
  if (chainVolume === undefined) return mcp
  return { ...mcp, volume: chainVolume }
}

export function createMarketplaceRouter(storage: StorageService) {
  const router = new Hono();
  const isProd = process.env.NODE_ENV === "production";

  // GET /api/marketplace — List all MCP standards
  router.get("/", async (c) => {
    const standards = await storage.listMcps();
    const onChainVolumeIndex = await loadOnChainVolumeIndex(process.env.STELLAR_PLATFORM_PUBLIC)
    const merged = standards.map((mcp) => mergeOnChainVolume(mcp, onChainVolumeIndex))
    const sorted = merged.sort((a, b) => b.usageCount - a.usageCount);
    const totalVolume = sorted.reduce((sum, item) => sum + (item.volume || 0), 0)
    return c.json({ standards: sorted, total: sorted.length, totalVolume });
  });

  // GET /api/marketplace/:id
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const standard = await storage.getMcp(id);
    if (!standard) return c.json({ error: "MCP standard not found" }, 404);
    const onChainVolumeIndex = await loadOnChainVolumeIndex(process.env.STELLAR_PLATFORM_PUBLIC)
    const merged = mergeOnChainVolume(standard, onChainVolumeIndex)
    return c.json(merged);
  });

  const createMcpSchema = z.object({
    title: z.string().min(3).max(200),
    description: z.string().min(10).max(2000),
    targetApp: z.string().min(1),
    dataSource: z.string().min(1),
    useCase: z.string().min(10).max(2000),
    targetSector: z.string().optional(),
    metrics: z.array(z.string()).min(1),
    apiEndpoint: z.string().url(),
    authType: z.enum(["oauth2", "api_key", "bearer", "none"]),
    oauthScopes: z.string().optional(),
    responseFormat: z.string().optional().default(""),
    rateLimitInfo: z.string().optional(),
    exampleResponse: z.string().optional(),
    errorCodes: z.string().optional(),
    verificationMethod: z.enum(["api-zktls", "device-tee", "fhe-range", "zk-selective"]).default("api-zktls"),
    dataTimingMode: z.enum(["realtime", "historical", "periodic"]).default("realtime"),
    updateFrequency: z.string().optional(),
    creatorAddress: z.string().startsWith("G").length(56).optional(),
    usageFee: z.number().min(0).max(10).optional().default(0.05),
    freshnessSlaHours: z.number().int().min(1).max(168).optional().default(24),
    minWitnessCount: z.number().int().min(1).max(10).optional().default(1),
    deliveryFormat: z.enum(["json", "cbor", "protobuf"]).optional().default("json"),
    requiresConsentTx: z.boolean().optional().default(true),
    skillDocContent: z.string().optional(),
    skillDocFilename: z.string().optional(),
  });

  // POST /api/marketplace — Upload new MCP standard
  // DEPRECATED: Client now uploads to IPFS + Stellar directly, then POSTs to /api/notify/mcp
  // Kept for backward compatibility
  router.post("/", zValidator("json", createMcpSchema), async (c) => {
    const body = c.req.valid("json");
    const id = uuidv4();
    const secret = process.env.PSEUDONYM_SECRET;
    if (!secret) return c.json({ error: "PSEUDONYM_SECRET not configured" }, 500);

    const creatorPseudo = body.creatorAddress
      ? generatePseudonym(secret, body.creatorAddress).pseudonym
      : generatePseudonym(secret, "marketplace-creator").pseudonym;

    // Upload skill document to IPFS if provided
    let skillDocCid: string | undefined;
    if (body.skillDocContent) {
      try {
        skillDocCid = await uploadJson(
          {
            type: "skill-document",
            mcpId: id,
            filename: body.skillDocFilename || "skill.md",
            content: body.skillDocContent,
            uploadedAt: new Date().toISOString(),
          },
          {
            name: `skill-doc-${id.slice(0, 8)}.json`,
            keyvalues: { type: "skill-doc", mcpId: id.slice(0, 32) },
          }
        );
        console.log(`[marketplace] Skill doc uploaded: ${skillDocCid} for MCP ${id.slice(0, 8)}`);
      } catch (err) {
        console.warn("[marketplace] Skill doc IPFS upload failed:", err);
      }
    }

    // Map verification method to legacy proofType for backwards compatibility
    const proofTypeMap: Record<string, string> = {
      "api-zktls": "zk-tls",
      "device-tee": "attested-runtime",
      "fhe-range": "hybrid",
      "zk-selective": "hybrid",
    };

    // Build advanced config with all the new detailed fields
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

    const mcp = {
      id,
      title: body.title,
      description: body.description,
      dataSource: body.dataSource,
      metrics: body.metrics,
      apiEndpoint: body.apiEndpoint,
      authType: body.authType,
      responseFormat: body.responseFormat ?? "",
      creator: creatorPseudo,
      creatorAddress: body.creatorAddress,
      usageFee: body.usageFee ?? 0.05,
      usageCount: 0,
      volume: 0,
      proofType: (proofTypeMap[body.verificationMethod] ?? "zk-tls") as "zk-tls" | "attested-runtime" | "hybrid",
      freshnessSlaHours: body.freshnessSlaHours ?? 24,
      minWitnessCount: body.minWitnessCount ?? 1,
      deliveryFormat: (body.deliveryFormat ?? "json") as "json" | "cbor" | "protobuf",
      schemaVersion: "1.0.0",
      dataRetentionDays: 30,
      requiresConsentTx: body.requiresConsentTx ?? true,
      advancedConfig,
      rating: 0,
      ratingCount: 0,
      ipfsHash: "",
      createdAt: new Date().toISOString(),
    };

    const result = await storage.storeMcp(mcp);
    mcp.ipfsHash = result.ipfsHash;

    return c.json(
      {
        id,
        ipfsHash: result.ipfsHash,
        skillDocCid: skillDocCid || null,
        stellarTx: result.stellarTx || null,
        status: "published",
        message: "MCP standard published to marketplace",
      },
      201
    );
  });

  // POST /api/marketplace/:id/use — Record usage + pay creator + track on-chain volume
  router.post("/:id/use", async (c) => {
    const id = c.req.param("id");
    const mcp = await storage.getMcp(id);
    if (!mcp) return c.json({ error: "MCP standard not found" }, 404);

    // Creator payout is executed at escrow release by contract split.
    // /use only tracks usage and on-chain volume metrics.
    const paidAmount = mcp.usageFee ?? 0
    const paymentTx: string | null = null
    const newVolume = (mcp.volume ?? 0) + paidAmount;
    const updated = await storage.updateMcp(id, {
      usageCount: mcp.usageCount + 1,
      volume: newVolume,
    });

    // Write volume to Stellar manage_data for on-chain transparency
    // Key: "mv:{mcpId first 24 chars}" → Value: "{volume} USDC"
    const platformSecret = process.env.STELLAR_PLATFORM_SECRET;
    let volumeTx: string | null = null;
    if (platformSecret && paidAmount > 0) {
      try {
        const keypair = Keypair.fromSecret(platformSecret);
        const volumeKey = `mv:${id.slice(0, 24)}`;
        const volumeValue = `${newVolume.toFixed(7)} USDC`;
        const result = await writeIndexEntry(keypair, volumeKey, volumeValue);
        volumeTx = (result as any).hash ?? null;
        console.log(`[marketplace] Volume on-chain: ${volumeValue} for ${id.slice(0, 8)} tx:${volumeTx}`);
      } catch (err) {
        if (isProd) {
          return c.json({ error: "Volume index write failed" }, 502);
        }
        console.warn("[marketplace] Volume index write failed (non-critical):", err);
      }
    } else if (isProd && paidAmount > 0) {
      return c.json({ error: "STELLAR_PLATFORM_SECRET not configured" }, 500);
    }

    return c.json({
      id,
      usageCount: updated!.usageCount,
      volume: updated!.volume,
      creatorPaid: paidAmount,
      paymentTx,
      volumeTx,
      message: "Usage recorded, volume updated on-chain",
    });
  });

  // POST /api/marketplace/:id/rate — Submit rating with reason (IPFS-backed)
  const rateSchema = z.object({
    rating: z.number().min(1).max(5),
    reason: z.string().max(2000).optional().default(""),
    walletAddress: z.string().startsWith("G").length(56),
  });

  router.post("/:id/rate", zValidator("json", rateSchema), async (c) => {
    const id = c.req.param("id");
    const { rating, reason, walletAddress } = c.req.valid("json");

    const existing = await storage.getMcp(id);
    if (!existing) return c.json({ error: "MCP standard not found" }, 404);

    // Store reason on IPFS if provided
    let reasonCid = "";
    if (reason) {
      try {
        const result = await storage.storeRaw({
          type: "review-reason",
          mcpId: id,
          rating,
          reason,
          reviewer: walletAddress,
          ts: Date.now(),
        });
        reasonCid = result.ipfsHash;
      } catch (err) {
        console.warn("[marketplace] Reason IPFS upload failed:", err);
      }
    }

    // Store review record
    const review = {
      reviewer: walletAddress,
      rating,
      reason_cid: reasonCid,
      reasonText: reason,
      verified_by: "platform",
      ts: Math.floor(Date.now() / 1000),
    };

    // Get existing reviews and append
    const existingReviews = (await storage.getReviews(id).catch(() => [])) as any[];
    existingReviews.push(review);
    await storage.storeReviews(id, existingReviews);

    // Update MCP rating
    const totalRating = existing.rating * existing.ratingCount + rating;
    const newRatingCount = existing.ratingCount + 1;

    const updated = await storage.updateMcp(id, {
      rating: totalRating / newRatingCount,
      ratingCount: newRatingCount,
    });

    return c.json({
      id,
      rating: updated!.rating,
      ratingCount: updated!.ratingCount,
      reasonCid,
    });
  });

  // GET /api/marketplace/:id/reviews — List reviews for an MCP
  router.get("/:id/reviews", async (c) => {
    const id = c.req.param("id");
    const reviews = await storage.getReviews(id).catch(() => []);
    return c.json({ reviews });
  });

  return router;
}
