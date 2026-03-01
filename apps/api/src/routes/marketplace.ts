import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { generatePseudonym } from "@dataeconomy/pseudonym";
import type { StorageService } from "@dataeconomy/storage";

export function createMarketplaceRouter(storage: StorageService) {
  const router = new Hono();

  // GET /api/marketplace — List all MCP standards
  router.get("/", async (c) => {
    const standards = await storage.listMcps();
    const sorted = standards.sort((a, b) => b.usageCount - a.usageCount);
    return c.json({ standards: sorted, total: sorted.length });
  });

  // GET /api/marketplace/:id
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    const standard = await storage.getMcp(id);
    if (!standard) return c.json({ error: "MCP standard not found" }, 404);
    return c.json(standard);
  });

  const createMcpSchema = z.object({
    title: z.string().min(3).max(200),
    description: z.string().min(10).max(2000),
    dataSource: z.string().min(1),
    metrics: z.array(z.string()).min(1),
    apiEndpoint: z.string().url(),
    authType: z.enum(["oauth2", "api_key", "bearer", "none"]),
    responseFormat: z.string().optional().default(""),
  });

  // POST /api/marketplace — Upload new MCP standard
  router.post("/", zValidator("json", createMcpSchema), async (c) => {
    const body = c.req.valid("json");
    const id = uuidv4();
    const secret = process.env.PSEUDONYM_SECRET || "dev-secret";
    const creator = generatePseudonym("marketplace-creator", secret).pseudonym;

    const mcp = {
      id,
      ...body,
      creator,
      usageCount: 0,
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
        stellarTx: result.stellarTx || null,
        status: "published",
        message: "MCP standard published to marketplace",
      },
      201
    );
  });

  // POST /api/marketplace/:id/use — Record usage
  router.post("/:id/use", async (c) => {
    const id = c.req.param("id");
    const updated = await storage.updateMcp(id, {
      usageCount: ((await storage.getMcp(id))?.usageCount || 0) + 1,
    });
    if (!updated) return c.json({ error: "MCP standard not found" }, 404);

    return c.json({
      id,
      usageCount: updated.usageCount,
      message: "Usage recorded",
    });
  });

  // POST /api/marketplace/:id/rate
  const rateSchema = z.object({
    rating: z.number().min(1).max(5),
    pseudoId: z.string().min(1),
  });

  router.post("/:id/rate", zValidator("json", rateSchema), async (c) => {
    const id = c.req.param("id");
    const { rating } = c.req.valid("json");

    const existing = await storage.getMcp(id);
    if (!existing) return c.json({ error: "MCP standard not found" }, 404);

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
    });
  });

  return router;
}
