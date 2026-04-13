// ---------------------------------------------------------------------------
// @pde/pseudonym
//
// Utilities for generating and verifying deterministic pseudonyms for
// data providers. A pseudonym lets the platform correlate contributions
// from the same user across sessions without storing their real identity.
//
// Algorithm:
//   pseudonym = base64url( HMAC-SHA256( platformSecret, userId ) ).slice(0, 16)
// ---------------------------------------------------------------------------

import { createHmac } from "crypto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PseudonymRecord {
  /** The opaque pseudonym string shared with data buyers */
  pseudonym: string;
  /** ISO-8601 timestamp when the pseudonym was created */
  createdAt: string;
}

// ---------------------------------------------------------------------------
// generatePseudonym
//
// Produces a stable 16-character URL-safe Base64 pseudonym for a userId.
// The same (secret, userId) pair always yields the same pseudonym.
//
// platformSecret — a server-side secret (min 32 bytes recommended).
// userId         — the platform's internal user identifier.
// ---------------------------------------------------------------------------

export function generatePseudonym(
  platformSecret: string,
  userId: string
): PseudonymRecord {
  const hmac = createHmac("sha256", platformSecret);
  hmac.update(userId);
  const digest = hmac.digest("base64url");
  // Truncate to 16 characters for readability; still 96 bits of entropy.
  const pseudonym = digest.slice(0, 16);

  return {
    pseudonym,
    createdAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// verifyPseudonym
//
// Returns true if the supplied pseudonym matches the one derived from userId.
// Constant-time comparison via HMAC re-derivation.
// ---------------------------------------------------------------------------

export function verifyPseudonym(
  platformSecret: string,
  userId: string,
  candidatePseudonym: string
): boolean {
  const { pseudonym } = generatePseudonym(platformSecret, userId);
  // Constant-time string comparison (both same length after slice(0,16))
  if (pseudonym.length !== candidatePseudonym.length) return false;

  let diff = 0;
  for (let i = 0; i < pseudonym.length; i++) {
    diff |= pseudonym.charCodeAt(i) ^ candidatePseudonym.charCodeAt(i);
  }
  return diff === 0;
}
