import { z } from "zod";

// Stellar public key: G ile başlar, 56 karakter (Base32 encoded)
export const stellarAuthSchema = z.object({
  publicKey: z.string().startsWith("G").length(56),
  signature: z.string().min(1),
  challenge: z.string().min(1),
});

export type StellarAuthValues = z.infer<typeof stellarAuthSchema>;
