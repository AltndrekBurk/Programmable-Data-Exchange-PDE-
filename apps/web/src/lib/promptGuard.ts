/**
 * promptGuard
 * -----------
 * Hardens free-text user intent before it is handed to any LLM-driven agent
 * (Buyer Agent, Seller Agent, MCP evaluator). PDE's skill.md is consumed by
 * the Seller Agent, which means free-text fields are a cross-tenant prompt
 * surface. This sanitizer is the single chokepoint for that surface.
 *
 * Contract:
 *   const { cleaned, wrapped, warnings, blocked } = guardIntent(raw);
 *
 *   - `cleaned`  : text safe to display and persist
 *   - `wrapped`  : `<user_intent>` sandbox string — use this verbatim when
 *                  embedding into any agent prompt. Never concatenate `cleaned`
 *                  directly into a system prompt.
 *   - `warnings` : user-visible notes about what was stripped
 *   - `blocked`  : true if the intent is unsafe and must not be sent
 *
 * This runs purely on the client. It does not replace server-side validation.
 */

export type GuardWarning =
  | "zero-width-stripped"
  | "bidi-override-stripped"
  | "role-token-stripped"
  | "fence-escaped"
  | "jailbreak-phrase-stripped"
  | "length-capped"
  | "empty";

export interface GuardResult {
  cleaned: string;
  wrapped: string;
  warnings: GuardWarning[];
  blocked: boolean;
  originalLength: number;
}

const MAX_LEN = 2000;

// Unicode that hides content from users but is still visible to tokenizers.
const ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
// Bidi overrides (RLO/LRO/etc.) — classic prompt-injection trick.
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g;

// Role / control tokens used by common chat templates.
const ROLE_TOKENS = [
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
  /\[\/?INST\]/gi,
  /<<SYS>>/gi,
  /<<\/SYS>>/gi,
  /^\s*system\s*:/gim,
  /^\s*assistant\s*:/gim,
  /^\s*developer\s*:/gim,
];

// Known jailbreak phrases. Non-exhaustive; we also rely on sandboxing.
const JAILBREAK_PHRASES = [
  /ignore (all |the )?(previous|above|prior) (instructions?|messages?|prompt)/gi,
  /disregard (all |the )?(previous|above|prior)/gi,
  /you are now (an? )?[a-z-]+/gi,
  /act as (an? )?(unrestricted|jailbroken|dan)/gi,
  /pretend (to be|you are) (an? )?(system|admin|root)/gi,
  /reveal (your|the) (system )?prompt/gi,
  /print (your|the) (system )?prompt/gi,
];

// Markdown/code fences an attacker could use to "close" the sandbox tag.
const FENCE = /```|~~~|<\/user_intent>/gi;

export function guardIntent(raw: string): GuardResult {
  const originalLength = raw?.length ?? 0;
  const warnings: GuardWarning[] = [];

  if (!raw || !raw.trim()) {
    return {
      cleaned: "",
      wrapped: "<user_intent safe=\"true\"></user_intent>",
      warnings: ["empty"],
      blocked: true,
      originalLength: 0,
    };
  }

  let s = raw;

  // 1. Normalize unicode (NFKC) — collapses look-alike homoglyphs that
  //    otherwise slip past token matchers.
  try {
    s = s.normalize("NFKC");
  } catch {
    // older runtimes — ignore
  }

  // 2. Strip zero-width and bidi overrides.
  if (ZERO_WIDTH.test(s)) {
    s = s.replace(ZERO_WIDTH, "");
    warnings.push("zero-width-stripped");
  }
  if (BIDI.test(s)) {
    s = s.replace(BIDI, "");
    warnings.push("bidi-override-stripped");
  }

  // 3. Strip role / control tokens.
  let roleHit = false;
  for (const re of ROLE_TOKENS) {
    if (re.test(s)) {
      roleHit = true;
      s = s.replace(re, " ");
    }
  }
  if (roleHit) warnings.push("role-token-stripped");

  // 4. Neutralize jailbreak phrases.
  let jbHit = false;
  for (const re of JAILBREAK_PHRASES) {
    if (re.test(s)) {
      jbHit = true;
      s = s.replace(re, "[removed]");
    }
  }
  if (jbHit) warnings.push("jailbreak-phrase-stripped");

  // 5. Escape anything that could close the sandbox tag or re-open markdown.
  if (FENCE.test(s)) {
    s = s.replace(/```/g, "''' ")
         .replace(/~~~/g, "''' ")
         .replace(/<\/user_intent>/gi, "&lt;/user_intent&gt;");
    warnings.push("fence-escaped");
  }

  // 6. Collapse runs of whitespace and trim.
  s = s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  // 7. Cap length.
  if (s.length > MAX_LEN) {
    s = s.slice(0, MAX_LEN);
    warnings.push("length-capped");
  }

  const blocked = s.length === 0;

  // Sandbox tag — agents should be instructed to treat anything inside
  // <user_intent> as data, not instructions.
  const wrapped = `<user_intent safe="true" source="pde-web" len="${s.length}">\n${s}\n</user_intent>`;

  return {
    cleaned: s,
    wrapped,
    warnings,
    blocked,
    originalLength,
  };
}

/** Short human-readable label for a warning. */
export function describeWarning(w: GuardWarning): string {
  switch (w) {
    case "zero-width-stripped":
      return "Invisible characters removed";
    case "bidi-override-stripped":
      return "Right-to-left override removed";
    case "role-token-stripped":
      return "Chat role tokens removed";
    case "fence-escaped":
      return "Code fences neutralised";
    case "jailbreak-phrase-stripped":
      return "Jailbreak phrase removed";
    case "length-capped":
      return "Truncated to 2000 chars";
    case "empty":
      return "Empty intent";
  }
}
