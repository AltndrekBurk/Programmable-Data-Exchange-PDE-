import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { generatePseudonym } from "@dataeconomy/pseudonym";

const marketplaceRouter = new Hono();

// In-memory store (TODO: replace with database)
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
  usageCount: number;
  rating: number;
  ratingCount: number;
  ipfsHash: string;
  createdAt: string;
}

const mcpStore = new Map<string, McpStandard>();

// GET /api/marketplace — List all MCP standards
marketplaceRouter.get("/", async (c) => {
  const standards = Array.from(mcpStore.values()).sort(
    (a, b) => b.usageCount - a.usageCount
  );
  return c.json({ standards, total: standards.length });
});

// GET /api/marketplace/:id — Get single MCP standard
marketplaceRouter.get("/:id", async (c) => {
  const id = c.req.param("id");
  const standard = mcpStore.get(id);
  if (!standard) {
    return c.json({ error: "MCP standard not found" }, 404);
  }
  return c.json(standard);
});

// POST /api/marketplace — Upload new MCP standard
const createMcpSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(10).max(2000),
  dataSource: z.string().min(1),
  metrics: z.array(z.string()).min(1),
  apiEndpoint: z.string().url(),
  authType: z.enum(["oauth2", "api_key", "bearer", "none"]),
  responseFormat: z.string().optional().default(""),
});

marketplaceRouter.post(
  "/",
  zValidator("json", createMcpSchema),
  async (c) => {
    const body = c.req.valid("json");

    const id = uuidv4();
    const secret = process.env.PSEUDONYM_SECRET || "dev-secret";
    // creator is pseudo_id derived from a placeholder (would be from auth header in production)
    const creator = generatePseudonym("marketplace-creator", secret).pseudonym;

    const standard: McpStandard = {
      id,
      ...body,
      creator,
      usageCount: 0,
      rating: 0,
      ratingCount: 0,
      ipfsHash: `QmMock${id.slice(0, 8)}`,
      createdAt: new Date().toISOString(),
    };

    // TODO: Upload to IPFS with Pinata
    // TODO: Record on Stellar blockchain

    mcpStore.set(id, standard);

    return c.json(
      {
        id,
        ipfsHash: standard.ipfsHash,
        status: "published",
        message: "MCP standard published to marketplace",
      },
      201
    );
  }
);

// POST /api/marketplace/:id/use — Record usage (for per-use payment)
marketplaceRouter.post("/:id/use", async (c) => {
  const id = c.req.param("id");
  const standard = mcpStore.get(id);
  if (!standard) {
    return c.json({ error: "MCP standard not found" }, 404);
  }

  standard.usageCount += 1;
  mcpStore.set(id, standard);

  // TODO: Trigger per-use payment to creator via Stellar contract

  return c.json({
    id,
    usageCount: standard.usageCount,
    message: "Usage recorded",
  });
});

// POST /api/marketplace/:id/rate — Rate MCP standard
const rateSchema = z.object({
  rating: z.number().min(1).max(5),
  pseudoId: z.string().min(1),
});

marketplaceRouter.post(
  "/:id/rate",
  zValidator("json", rateSchema),
  async (c) => {
    const id = c.req.param("id");
    const { rating } = c.req.valid("json");

    const standard = mcpStore.get(id);
    if (!standard) {
      return c.json({ error: "MCP standard not found" }, 404);
    }

    // Simple rolling average
    const totalRating = standard.rating * standard.ratingCount + rating;
    standard.ratingCount += 1;
    standard.rating = totalRating / standard.ratingCount;
    mcpStore.set(id, standard);

    // TODO: Record rating on Stellar smart contract (feedback contract)

    return c.json({
      id,
      rating: standard.rating,
      ratingCount: standard.ratingCount,
    });
  }
);

export { marketplaceRouter };
