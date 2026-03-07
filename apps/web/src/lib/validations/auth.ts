import { z } from "zod";

// Stellar public key: starts with G, 56 characters (Base32 encoded)
export const stellarAuthSchema = z.object({
  publicKey: z.string().startsWith("G").length(56),
  signature: z.string().min(1),
  challenge: z.string().min(1),
});

export type StellarAuthValues = z.infer<typeof stellarAuthSchema>;
