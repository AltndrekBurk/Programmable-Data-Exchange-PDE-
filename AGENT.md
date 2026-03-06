# AGENT.md — OpenClaw Integration for dataEconomy

**Version**: 1.0
**Last Updated**: 2026-03-01
**Target**: OpenClaw self-hosted AI gateway users

---

## Overview

OpenClaw is a self-hosted AI gateway that receives task notifications from the dataEconomy platform via the `/hooks/agent` endpoint and acts as the interface between users and the data economy flow. This document defines how OpenClaw integrates with dataEconomy to handle consent decisions, execute data extraction, generate ZK proofs, and return results.

**Key role**: OpenClaw listens for Stellar consent transactions, extracts data from APIs (Fitbit, Strava, etc.), generates ZK-TLS proofs via Reclaim Protocol, and submits proofs back to the platform with X402 payment.

---

## Architecture

```
User (WhatsApp/Telegram/Discord)
    ↕
OpenClaw (self-hosted, AI agent + MCP tools)
    ↕
Stellar (consent TX listener via Horizon SSE)
    ↕
dataEconomy Platform (POST /hooks/agent → notifications)
                   (POST /api/proofs/submit ← proof delivery)
                   (Stellar + USDC escrow)
```

### Data Flow

1. **Skill Creation** — Requester creates/uploads skill to platform
2. **Escrow Deposit** — USDC locked in Soroban contract
3. **OpenClaw Notification** — Platform sends `POST /hooks/agent` with task details
4. **User Decision** — User replies "evet"/"hayır" (yes/no) via messaging app
5. **Consent TX** — Backend records decision on Stellar (memo: `CONSENT:...`)
6. **OpenClaw Listener** — Horizon SSE detects consent TX
7. **Data Extraction** — OpenClaw tool executes (Fitbit/Strava OAuth → API call)
8. **ZK Proof** — Reclaim zkFetch wraps API response in ZK-TLS proof
9. **Proof Submission** — POST `/api/proofs/submit` with X402 payment header
10. **Escrow Release** — Soroban 3-way split atomically executed
11. **Result Delivery** — Encrypted proof bundle sent to requester

---

## Setup Instructions

### 1. Deploy OpenClaw

```bash
# Clone OpenClaw repository
git clone https://github.com/nicholasgriffintn/openclaw.git
cd openclaw

# Install dependencies
npm install

# Create .env.local (or equivalent for your deployment)
OPENCLAW_PORT=3002
OPENCLAW_TOKEN=<secure-random-token>

# Supported channels
WHATSAPP_BUSINESS_ACCOUNT_ID=<your-whatsapp-account>
TELEGRAM_BOT_TOKEN=<your-telegram-token>
DISCORD_BOT_TOKEN=<your-discord-token>

# Stellar + dataEconomy
STELLAR_PLATFORM_ACCOUNT=<platform-public-address>
STELLAR_TESTNET_URL=https://horizon-testnet.stellar.org

# Reclaim Protocol (for ZK proofs)
RECLAIM_APP_ID=<your-reclaim-app-id>
RECLAIM_APP_SECRET=<your-reclaim-app-secret>

# Start the gateway
npm run dev
```

### 2. Register with dataEconomy Platform

As a data provider, register on the platform:

1. Visit `/register/provider` on dataEconomy web app
2. Authenticate with your Stellar Freighter wallet
3. Mark supported data types: **API** (MVP) or **Device** (Phase 2)
4. Register OpenClaw credentials:
   - **OpenClaw URL**: `https://your-openclaw.example.com`
   - **OpenClaw Token**: The `OPENCLAW_TOKEN` from .env
   - **Channels**: Select WhatsApp, Telegram, and/or Discord
   - **Addresses**: +90... (WhatsApp), @username (Telegram), Discord ID

### 3. Configure MCP Tools

OpenClaw uses Model Context Protocol (MCP) tools to extract data. These are defined in your local configuration:

```
openclaw/
├── tools/
│   ├── fitbit-oauth.json          # OAuth flow + token refresh
│   ├── strava-oauth.json
│   ├── spotify-oauth.json
│   ├── google-fit-oauth.json
│   └── custom-provider.json       # Template for new sources
├── config/
│   └── dataeconomy.config.ts      # Platform integration settings
└── agents/
    └── data-provider.ts           # Main agent logic
```

---

## Message Format: POST /hooks/agent

### Request Payload

Platform sends notifications to your OpenClaw instance via:

```bash
POST /hooks/agent
Authorization: Bearer <OPENCLAW_TOKEN>
Content-Type: application/json

{
  "message": "📊 Yeni veri görevi mevcut!\n\nSkill: 8d5f4b1a...\n\nKabul etmek için \"evet\", reddetmek için \"hayır\" yaz.",
  "name": "DataEconomy-Notify",
  "agentId": "main",
  "sessionKey": "skill:8d5f4b1a-...:a7f3x9k2m1p8q4r5",
  "wakeMode": "now",
  "deliver": true,
  "channel": "whatsapp",
  "to": "+90501234567"
}
```

### Field Reference

| Field | Type | Required | Description |
|---|---|---|---|
| `message` | string | Yes | Notification text (emoji safe). Informs user of task details. |
| `name` | string | Yes | Always `"DataEconomy-Notify"` — identifies message source |
| `agentId` | string | Yes | Agent handling the task. Use `"main"` for single-agent setup. |
| `sessionKey` | string | Yes | Format: `skill:{skillId}:{pseudoId}` — groups related messages. |
| `wakeMode` | string | Yes | Always `"now"` — deliver immediately. |
| `deliver` | boolean | Yes | Always `true` — actually send the message. |
| `channel` | enum | Yes | `"whatsapp"`, `"telegram"`, or `"discord"` |
| `to` | string | Yes | Recipient: `+90...` (WhatsApp), `@username` (Telegram), Discord ID |

### Response (from OpenClaw)

```json
{
  "success": true,
  "messageId": "msg_abc123",
  "deliveredAt": "2026-03-01T14:23:45.000Z"
}
```

---

## Consent Flow: User Decision Handling

### User Messages

User responds via their messaging app:

| Response | Meaning | Stellar TX Memo |
|---|---|---|
| `evet` / `yes` / `✅` | Accept task | `CS:8d5f4b1a:a7f3x9k2:A` |
| `hayır` / `no` / `❌` | Reject task | `CS:8d5f4b1a:a7f3x9k2:R` |

### OpenClaw Agent Logic (Pseudocode)

```typescript
agent.onMessage(async (msg) => {
  // 1. Extract sessionKey from context
  const sessionKey = msg.sessionKey; // "skill:8d5f4b1a-...:a7f3x9k2..."
  const [_, skillId, pseudoId] = sessionKey.split(':');

  // 2. Parse decision
  const decision = parseConsent(msg.text);
  if (!decision) {
    agent.reply("Anlamadım. \"evet\" veya \"hayır\" cevabı veriniz.", msg);
    return;
  }

  // 3. Record consent to Stellar
  const result = await recordConsent({
    skillId,
    pseudoId,
    decision, // "ACCEPT" | "REJECT"
  });

  if (result.success) {
    agent.reply(
      `Karar kaydedildi (TX: ${result.txHash.slice(0, 8)}...).\n` +
      (decision === "ACCEPT"
        ? "Veri çekme başlayacak..."
        : "Görev reddedildi."),
      msg
    );
  } else {
    agent.reply("Karar kaydedilemedi. Lütfen tekrar deneyin.", msg);
  }

  // 4. If ACCEPT, trigger data extraction
  if (decision === "ACCEPT") {
    extractAndProveData(skillId, pseudoId, msg);
  }
});
```

### Recording Consent to Platform

OpenClaw POSTs the user's decision back to the platform's consent endpoint:

```bash
POST /api/consent/record
Content-Type: application/json

{
  "skillId": "8d5f4b1a-abcd-1234-efgh-567890ijklmn",
  "pseudoId": "a7f3x9k2m1p8q4r5",
  "decision": "ACCEPT"
}
```

**Response**:
```json
{
  "status": "recorded",
  "memo": "CS:8d5f4b1a:a7f3x9k2:A",
  "stellarTx": "3e6c7d...",
  "decision": "ACCEPT",
  "timestamp": "2026-03-01T14:24:30.000Z"
}
```

---

## Data Extraction: MCP Tools

After user accepts task, OpenClaw executes the appropriate MCP tool based on the skill's `dataSource`.

### Tool: fitbit-oauth

**Purpose**: Extract Fitbit steps, heart rate, sleep, weight data.

**MCP Definition**:
```json
{
  "name": "fitbit-oauth",
  "description": "Authenticate user with Fitbit and extract health metrics via ZK-TLS proof",
  "inputSchema": {
    "type": "object",
    "properties": {
      "metric": {
        "type": "string",
        "enum": ["steps", "heart_rate", "sleep", "weight"],
        "description": "Fitbit metric to prove"
      },
      "accessToken": {
        "type": "string",
        "description": "OAuth 2.0 access token from Fitbit (user provides via OAuth flow)"
      }
    },
    "required": ["metric", "accessToken"]
  },
  "output": {
    "type": "object",
    "properties": {
      "proof": { "type": "object", "description": "Reclaim ZK-TLS proof" },
      "timestamp": { "type": "string", "description": "ISO timestamp when proof was created" }
    }
  }
}
```

**Execution**:
```typescript
const result = await callMCPTool("fitbit-oauth", {
  metric: "steps",
  accessToken: userFitbitToken,
});

// result.proof is a ReclaimProof object
// result.timestamp is when it was generated
```

### Tool: strava-oauth

**Purpose**: Extract Strava running distance, elevation, moving time.

```json
{
  "name": "strava-oauth",
  "description": "Extract Strava athlete stats via ZK-TLS proof",
  "inputSchema": {
    "type": "object",
    "properties": {
      "metric": {
        "type": "string",
        "enum": ["distance", "moving_time", "elapsed_time", "total_elevation_gain"],
        "description": "Strava metric to prove"
      },
      "accessToken": {
        "type": "string",
        "description": "OAuth 2.0 access token from Strava"
      }
    },
    "required": ["metric", "accessToken"]
  }
}
```

### Tool: spotify-oauth

**Purpose**: Extract Spotify listening statistics.

```json
{
  "name": "spotify-oauth",
  "description": "Extract user's top tracks, artists, listening time",
  "inputSchema": {
    "type": "object",
    "properties": {
      "metric": {
        "type": "string",
        "enum": ["top_tracks", "top_artists", "recently_played", "listening_time"],
        "description": "Spotify metric"
      },
      "accessToken": { "type": "string" },
      "timeRange": {
        "type": "string",
        "enum": ["short_term", "medium_term", "long_term"],
        "description": "Time range for Spotify API"
      }
    },
    "required": ["metric", "accessToken"]
  }
}
```

### Defining Custom Tools

For new data sources (e.g., Plaid, Google Fit, Garmin), create a template:

```json
{
  "name": "custom-provider",
  "description": "Template for new OAuth-based data sources",
  "inputSchema": {
    "type": "object",
    "properties": {
      "provider": {
        "type": "string",
        "description": "API provider name (e.g., 'plaid', 'google-fit')"
      },
      "metric": {
        "type": "string",
        "description": "Specific metric/endpoint to extract"
      },
      "accessToken": {
        "type": "string",
        "description": "OAuth 2.0 access token for the provider"
      },
      "parameters": {
        "type": "object",
        "description": "Provider-specific parameters (e.g., account_id for Plaid)"
      }
    },
    "required": ["provider", "metric", "accessToken"]
  }
}
```

---

## Proof Generation & Submission

### Generating ZK-TLS Proofs

After data extraction via MCP tool, OpenClaw receives a `ReclaimProof` object. The proof structure:

```typescript
interface ReclaimProof {
  identifier: string;                    // User's pseudonymous ID
  claimData: {
    provider: string;                    // "fitbit", "strava", etc.
    parameters: string;                  // API endpoint/parameters
    owner: string;                       // Attester public key
    timestampS: number;                  // Proof creation time (Unix)
    context: string;                     // Witness commitment
    identifier: string;
    epoch: number;                       // Reclaim attestor epoch
  };
  signatures: string[];                  // Reclaim attestor signature(s)
  witnesses: Array<{ id: string; url: string }>; // Witness servers
  extractedParameterValues?: {
    [key: string]: string;              // Extracted metric values (optional reveal)
  };
}
```

### Submitting Proof with X402 Payment

After generating proof, OpenClaw submits it to the platform with X402 payment header:

```bash
POST /api/proofs/submit
Authorization: Bearer <X402-token>
X-Payment: <X402-payment-header>
Content-Type: application/json

{
  "skillId": "8d5f4b1a-abcd-1234-efgh-567890ijklmn",
  "pseudoId": "a7f3x9k2m1p8q4r5",
  "dataSource": "fitbit",
  "metric": "steps",
  "proof": {
    "identifier": "...",
    "claimData": { ... },
    "signatures": [ ... ],
    "witnesses": [ ... ]
  },
  "timestamp": "2026-03-01T14:25:15.000Z"
}
```

### X402 Payment (Spam Prevention)

**X402** is an HTTP ödeme protokolü implemented via OpenZeppelin Relayer on Stellar.

**Before submitting proof:**

1. Obtain X402 challenge from the facilitator
2. Include Stellar signature in `X-Payment` header
3. Submit proof with X402 token

**In OpenClaw**:

```typescript
// 1. Get X402 challenge
const challengeRes = await fetch("https://channels.openzeppelin.com/x402/testnet/challenge");
const { challenge } = await challengeRes.json();

// 2. Sign challenge with your keypair
const signature = yourKeypair.sign(Buffer.from(challenge)).toString('base64');

// 3. Include in proof submission
const proofRes = await fetch(`${PLATFORM_URL}/api/proofs/submit`, {
  method: 'POST',
  headers: {
    'X-Payment': `Bearer ${signature}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ skillId, pseudoId, proof }),
});
```

### Response from Platform

```json
{
  "status": "verified",
  "skillId": "8d5f4b1a-...",
  "pseudoId": "a7f3x9k2m1p8q4r5",
  "proofHash": "sha256:9f8e7d6c...",
  "escrowReleased": true,
  "timestamp": "2026-03-01T14:25:30.000Z"
}
```

If verification fails:

```json
{
  "status": "rejected",
  "reason": "Invalid ZK signature",
  "timestamp": "2026-03-01T14:25:30.000Z"
}
```

---

## Horizon SSE Listener (Stellar Consent Monitoring)

OpenClaw maintains a persistent Horizon SSE listener on the platform's Stellar account to detect consent transactions in real-time.

### Setup

```typescript
import { streamConsentTransactions } from '@dataeconomy/stellar';

const platformAccount = process.env.STELLAR_PLATFORM_ACCOUNT;

const unsubscribe = streamConsentTransactions(platformAccount, (tx) => {
  // Memo format: "CONSENT:skillId:pseudoId:ACCEPT|REJECT"
  console.log(`Consent received: ${tx.skillId} → ${tx.decision}`);

  // Trigger data extraction if ACCEPT
  if (tx.decision === 'ACCEPT') {
    triggerDataExtraction(tx.skillId, tx.userId);
  }
});

// When shutting down:
// unsubscribe();
```

### Memo Parsing

Platform writes memos like: `CONSENT:8d5f4b1a:a7f3x9k2:ACCEPT`

**OpenClaw parses** as:
- `skillId` = `8d5f4b1a`
- `pseudoId` = `a7f3x9k2`
- `decision` = `ACCEPT` or `REJECT`

---

## Notification Message Templates

### Task Offered (English)

```
📊 New data task available!

Skill: Fitbit Steps (90 days)
Reward: 1.50 USDC
Duration: Ongoing

Reply "yes" to accept, "no" to decline.
```

### Task Offered (Turkish)

```
📊 Yeni veri görevi mevcut!

Skill: Fitbit Adım (90 gün)
Ödül: 1.50 USDC
Süre: Devam ediyor

Kabul etmek için "evet", reddetmek için "hayır" yaz.
```

### Consent Recorded

```
✅ Karar kaydedildi!
Kimlik: b8a...
Veri çekme başlıyor...
```

### Data Extraction Started

```
⏳ Fitbit'e bağlanıyor...
Lütfen bekleyin.
```

### Proof Generated

```
🔐 Kanıt oluşturuldu!
Gönderiliyor...

ID: 9f8e7d6c...
```

### Success

```
✨ Tamamlandı!
Ödeme Stellar ağında işledi.
TX: 3e6c7d8a...

Kazancınız hesabınıza aktarıldı.
```

### Error

```
❌ Hata oluştu: {reason}
Lütfen tekrar deneyin veya yardım isteyin.
```

---

## Error Handling & Retries

### Common Errors

| Error | Cause | Recovery |
|---|---|---|
| `X402 payment failed` | Insufficient balance or invalid signature | Check Stellar account balance, retry with new signature |
| `ZK proof invalid` | Reclaim attestation verification failed | Regenerate proof, check API was called with correct params |
| `Skill not found` | skillId doesn't exist on platform | Confirm skillId from notification message |
| `Consent not found` | Stellar TX hasn't been indexed yet | Wait 2-5 seconds, retry |
| `Metric not available` | API doesn't return requested metric | Check API credentials, confirm metric is available |

### Retry Logic

```typescript
const retryWithBackoff = async (fn, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }
};

// Usage
const proof = await retryWithBackoff(() => createFitbitProof(token, metric));
```

---

## Privacy & Security

### Key Principles

1. **Ham veri hiçbir zaman platform'a ulaşmaz** — Reclaim zkFetch encrypts API responses client-side
2. **Pseudonym isolation** — Each user has a cryptographic pseudo_id (HMAC-SHA256) that cannot be reversed
3. **Token management** — OAuth tokens stay on user's OpenClaw instance, never sent to platform
4. **Proof-only submission** — Only ZK proofs (no raw data) cross the network
5. **Stellar signatures** — All consent + proof decisions are cryptographically signed on Stellar

### OpenClaw Security Checklist

- [ ] Use HTTPS for all outbound requests
- [ ] Store `OPENCLAW_TOKEN` securely (no plaintext logs)
- [ ] Rotate `RECLAIM_APP_SECRET` regularly
- [ ] Use environment variables for all secrets (.env, not checked in)
- [ ] Enable Stellar transaction signing with keypair (not private key in memory)
- [ ] Log only transaction hashes, never raw proof data
- [ ] Validate all incoming `/hooks/agent` requests (verify Authorization header)
- [ ] Monitor Horizon SSE stream for unexpected transactions

---

## Debugging & Monitoring

### Enable Verbose Logging

```typescript
process.env.DEBUG = 'openclaw:*,dataeconomy:*';

// In your agent:
if (process.env.DEBUG) {
  console.log('[openclaw] Processing skill:', skillId);
  console.log('[openclaw] Generated proof hash:', proof.identifier);
}
```

### Monitor Stellar Transactions

```bash
# Check all transactions for platform account
curl https://horizon-testnet.stellar.org/accounts/GXXXXXX/transactions?order=desc&limit=10

# Find specific consent TX
curl 'https://horizon-testnet.stellar.org/accounts/GXXXXXX/transactions?memo=CONSENT*'
```

### Test Proof Verification Locally

```typescript
import { verifyDataProof } from '@dataeconomy/reclaim';

const testProof = { /* ... */ };
const isValid = await verifyDataProof(testProof);
console.log('Proof valid:', isValid);
```

### Health Check

Implement a `/health` endpoint in OpenClaw:

```typescript
app.get('/health', async (c) => {
  const horizonHealthy = await checkHorizonConnection();
  const reclaimHealthy = process.env.RECLAIM_APP_ID ? true : false;

  return c.json({
    status: horizonHealthy && reclaimHealthy ? 'healthy' : 'degraded',
    horizon: horizonHealthy,
    reclaim: reclaimHealthy,
    timestamp: new Date().toISOString(),
  });
});
```

---

## FAQ

**Q: What if the user takes days to respond?**
A: Tasks expire after the duration specified (e.g., 90 days). Platform marks tasks as "expired" and refunds escrow minus dispute fee.

**Q: Can I run multiple OpenClaw instances for redundancy?**
A: Yes, but use a shared Stellar account (private key stored securely). Each instance can subscribe to the same SSE stream without conflicts.

**Q: What if Fitbit/Strava changes their API?**
A: Update the MCP tool definition in your openclaw/tools/ directory. Platform-side, provider configuration is on the IPFS skill document.

**Q: How do I know if my proof was accepted?**
A: Check the response status from `/api/proofs/submit`. If `status: "verified"`, escrow is released. You'll also receive a message back in your OpenClaw session.

**Q: What if the Stellar TX fails?**
A: Platform logs retry the escrow release on next block. If repeated failures, contact support — may be an issue with the Soroban contract.

**Q: Can I customize the MCP tools for my use case?**
A: Yes! Create a custom-provider tool following the template. Ensure the API endpoint returns data that can be ZK-TLS proven (TLS session recorded).

---

## Support & Resources

- **OpenClaw Repo**: https://github.com/nicholasgriffintn/openclaw
- **Reclaim Protocol**: https://github.com/reclaimprotocol
- **Stellar Docs**: https://developers.stellar.org/docs
- **X402 on Stellar**: https://developers.stellar.org/docs/build/apps/x402
- **dataEconomy GitHub**: (your repo link)
- **Testnet Faucet**: https://laboratory.stellar.org

---

## Version History

- **v1.0** (2026-03-01) — Initial OpenClaw integration guide. Covers consent flow, MCP tools, proof generation, X402 payment, Horizon SSE listener.

---

## Production Runbook (OpenClaw + Chain + IPFS + X402)

### Canonical data plane
1. Buyer/MCP creator publishes JSON directly to **IPFS (Pinata HTTPS API)** from frontend.
2. Frontend writes CID index to **Stellar** with Freighter signature (manage_data / contract call).
3. Frontend sends backend awareness notification (`/api/notify/*`) with `{txHash, ipfsHash}` only.

### Seller/OpenClaw control plane
1. OpenClaw listens to Stellar (Horizon/Soroban RPC) for consent + escrow events.
2. OpenClaw resolves skill/policy/MCP CIDs from on-chain index keys.
3. OpenClaw downloads CID payloads from IPFS gateway and validates policy constraints.
4. OpenClaw runs data extraction tool (MVP: API + zkTLS/Reclaim path), encrypts payload.
5. OpenClaw submits proof+encrypted delivery to facilitator `/api/proofs/submit` with `X-PAYMENT`.

### X402 enforcement (mandatory in prod)
- `/api/proofs/submit` is payment-gated with x402 middleware.
- Missing/invalid `X-PAYMENT` => HTTP 402 with payment requirements.
- Successful proof pipeline triggers facilitator `/settle` call.

### Escrow + MCP creator payout
- Escrow release is executed via Soroban contract calls.
- For marketplace-backed skills, release uses MCP-aware split function so creator fee is distributed in-contract (not manual backend transfer logic).
- Dispute/refund lifecycle remains contract-driven.

### Delivery security
- Buyer callback must be HTTPS in production.
- Facilitator relays encrypted payload; plaintext raw dataset should not persist on facilitator.



### Buyer-Seller encrypted delivery key model (Production)
- Buyer creates a delivery keypair locally (X25519 / age / NaCl).
- Buyer publishes **deliveryPublicKey** inside skill metadata (IPFS + on-chain index).
- OpenClaw fetches skill metadata, encrypts payload with deliveryPublicKey.
- Facilitator only relays encryptedPayload + checksum + proofHash to buyer callback.
- Buyer callback decrypts using buyer private key and validates integrity (`sha256(encryptedPayload)` vs checksum + proofHash binding).
- HTTPS proxy can terminate TLS but **must not** perform payload decryption.
- Facilitator must never persist plaintext payload.
