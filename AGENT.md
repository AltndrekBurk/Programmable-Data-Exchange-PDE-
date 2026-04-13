# AGENT.md — OpenClaw Agent Guide for PDE

**Version**: 3.0
**Last Updated**: 2026-04-13
**Model**: Agent-to-Agent (buyer bot ↔ seller bot)

---

## Overview

PDE uses OpenClaw bots as the primary interface for both buyers and sellers. Users interact through WhatsApp, Telegram, or Discord. Their bot handles everything: creating tasks, discovering providers, generating proofs, making payments, and delivering data.

**Two agent types:**
- **Buyer Agent**: Creates data requests, locks escrow, verifies proofs, pays per batch, decrypts data.
- **Seller Agent**: Publishes data policy, watches for matching requests, generates ZK proofs, delivers encrypted data row-by-row.

**The PDE server is optional.** Agents communicate through Stellar + IPFS. If the server is down, agents continue to transact.

---

## Architecture

```
Buyer (WhatsApp/Telegram/Discord)        Seller (WhatsApp/Telegram/Discord)
         │                                          │
         ▼                                          ▼
┌─────────────────┐    Stellar + IPFS    ┌─────────────────┐
│  Buyer Agent    │◄════════════════════►│  Seller Agent   │
│  (OpenClaw)     │                      │  (OpenClaw)     │
│                 │    ┌───────────┐     │                 │
│ - Create skill  │    │ Soroban   │     │ - Policy IPFS   │
│ - Lock escrow   │───►│ Escrow    │◄────│ - Watch skills  │
│ - Verify proofs │    │ Contract  │     │ - ZK proof gen  │
│ - x402 pay      │    └───────────┘     │ - Encrypt data  │
│ - Decrypt data  │                      │ - Batch deliver │
└────────┬────────┘    ┌───────────┐     └────────┬────────┘
         │             │ Attestor  │              │
         │             │ Core      │◄─────────────┘
         │             │ (TLS      │    zkFetch()
         │             │  witness) │
         │             └───────────┘
         │
         │  (Optional — enhances but not required)
         ▼
┌──────────────────────────┐
│  PDE Server              │
│  - Warm cache            │
│  - Push notifications    │
│  - Dispute admin         │
│  - Analytics             │
└──────────────────────────┘
```

---

## Setup: Seller Agent

### 1. Deploy OpenClaw

```bash
git clone https://github.com/nicholasgriffintn/openclaw.git
cd openclaw && npm install

# .env
OPENCLAW_PORT=3002
OPENCLAW_TOKEN=<secure-random-token>

# Messaging channels
WHATSAPP_BUSINESS_ACCOUNT_ID=<your-whatsapp-account>
TELEGRAM_BOT_TOKEN=<your-telegram-token>
DISCORD_BOT_TOKEN=<your-discord-token>

# Stellar (seller's own keypair)
STELLAR_SELLER_SECRET=S...seller_secret_key
STELLAR_SELLER_PUBLIC=G...seller_public_key

# Platform account (for SSE watching)
STELLAR_PLATFORM_ACCOUNT=G...platform_public_key
HORIZON_TESTNET=https://horizon-testnet.stellar.org

# ZK-TLS (self-hosted attestor — no APP_ID needed)
ATTESTOR_URL=http://localhost:8001

npm run dev
```

### 2. Deploy Attestor-Core

```bash
git clone https://github.com/reclaimprotocol/attestor-core
cd attestor-core && npm install

# Generate ed25519 keypair
node -e "
const { generateKeyPairSync } = require('crypto');
const kp = generateKeyPairSync('ed25519');
console.log('PRIVATE_KEY=' + kp.privateKey.export({type:'pkcs8',format:'der'}).toString('hex'));
console.log('PUBLIC_KEY=' + kp.publicKey.export({type:'spki',format:'der'}).toString('hex'));
"

echo "PRIVATE_KEY=<private-key-hex>" > .env
npm run start:tsc  # Port 8001
```

### 3. Register Policy on IPFS + Stellar

The seller agent publishes a policy describing what data it offers:

```typescript
const policy = {
  stellarAddress: "G...seller_address",
  dataSources: ["fitbit", "strava"],
  allowedMetrics: ["steps", "distance", "moving_time"],
  deniedMetrics: ["heart_rate", "sleep"],
  minPrice: 0.50,
  maxRowsPerRequest: 500,
  autoAccept: false,
  contactChannel: "whatsapp",
  contactId: "+90501234567",
  attestorUrl: "http://localhost:8001",
  createdAt: new Date().toISOString(),
  policyVersion: 1
};

// 1. Upload to IPFS
const cid = await uploadJson(policy, { name: `policy-${address}.json` });

// 2. Index on Stellar
const tx = new TransactionBuilder(account, { fee: BASE_FEE })
  .addOperation(Operation.manageData({
    name: `pr:${address.slice(0, 24)}`,
    value: cid
  }))
  .setTimeout(30)
  .build();
tx.sign(sellerKeypair);
await server.submitTransaction(tx);
```

---

## Setup: Buyer Agent

### 1. Deploy OpenClaw (same as seller)

```bash
# .env additions for buyer
STELLAR_BUYER_SECRET=S...buyer_secret_key
STELLAR_BUYER_PUBLIC=G...buyer_public_key
```

### 2. No Attestor Needed

Buyer only verifies proofs — doesn't generate them. Buyer needs the attestor's **public key** (from seller's policy or well-known list).

---

## Seller Agent: Core Logic

### Watching for New Skills

```typescript
import { Server } from 'stellar-sdk';

const server = new Server('https://horizon-testnet.stellar.org');
const platformAddress = process.env.STELLAR_PLATFORM_ACCOUNT;

// Watch for new manage_data entries
function watchForSkills(onNewSkill: (skillCid: string, skillId: string) => void) {
  // Poll or SSE for account data changes
  const es = server.accounts()
    .accountId(platformAddress)
    .stream({
      onmessage: async (account) => {
        for (const [key, value] of Object.entries(account.data_attr)) {
          if (key.startsWith('sk:')) {
            const skillId = key.slice(3);
            const cid = Buffer.from(value, 'base64').toString('utf8');
            onNewSkill(cid, skillId);
          }
        }
      }
    });
}
```

### Policy Evaluation

```typescript
async function evaluateSkill(skillCid: string, policy: SellerPolicy): Promise<boolean> {
  // Fetch skill from IPFS
  const skill = await fetchFromIpfs(skillCid);
  
  // Check data source
  if (!policy.dataSources.includes(skill.dataSource)) return false;
  
  // Check metrics
  for (const metric of skill.metrics) {
    if (policy.deniedMetrics.includes(metric)) return false;
  }
  
  // Check price
  if (skill.budget < policy.minPrice) return false;
  
  // Check row limits
  const estimatedRows = estimateRowCount(skill.duration);
  if (estimatedRows > policy.maxRowsPerRequest) return false;
  
  return true;
}
```

### User Consent Flow

```typescript
agent.onMessage(async (msg) => {
  const pendingTask = getPendingTask(msg.sessionKey);
  if (!pendingTask) return;
  
  const decision = parseConsent(msg.text); // "evet"→ACCEPT, "hayir"→REJECT
  if (!decision) {
    agent.reply("Anlamadim. 'evet' veya 'hayir' cevabi veriniz.", msg);
    return;
  }
  
  if (decision === 'ACCEPT') {
    // Write consent to Stellar
    const tx = new TransactionBuilder(account, { fee: BASE_FEE })
      .addOperation(Operation.manageData({
        name: `cs:${pendingTask.skillId}:${sellerAddr.slice(0, 4)}`,
        value: 'ACCEPT'
      }))
      .setTimeout(30)
      .build();
    tx.sign(sellerKeypair);
    await server.submitTransaction(tx);
    
    agent.reply(`Kabul edildi! Escrow kilidi bekleniyor...`, msg);
    
    // Wait for escrow lock, then start delivery
    waitForEscrowAndDeliver(pendingTask.skillId, pendingTask.skill);
  } else {
    agent.reply(`Gorev reddedildi.`, msg);
  }
});
```

### Row-by-Row Data Delivery

```typescript
async function deliverData(skill: Skill, escrowId: string) {
  const totalRows = estimateRowCount(skill.duration);
  const batchSize = skill.batchSize || 10;
  const totalBatches = Math.ceil(totalRows / batchSize);
  
  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    // 1. Generate ZK proofs for this batch
    const rows = [];
    for (let i = 0; i < batchSize; i++) {
      const rowIndex = batchIndex * batchSize + i;
      if (rowIndex >= totalRows) break;
      
      // zkFetch through attestor-core
      const proof = await zkFetch(
        `https://api.fitbit.com/1/user/-/activities/steps/date/${getDate(rowIndex)}/1d.json`,
        { headers: { Authorization: `Bearer ${oauthToken}` } },
        { attestorUrl: process.env.ATTESTOR_URL }
      );
      
      // Encrypt row data with buyer's deliveryPublicKey
      const encrypted = nacl.box(
        Buffer.from(JSON.stringify(proof.extractedParameterValues)),
        randomNonce(),
        buyerDeliveryPubKey,
        ephemeralSecretKey
      );
      
      rows.push({ encrypted: base64(encrypted), proof });
    }
    
    // 2. Bundle batch
    const batch = {
      batchIndex,
      totalBatches,
      escrowId,
      rows,
      batchHash: sha256(rows.map(r => r.proof.identifier).join(':')),
      sellerAddress: sellerPublicKey
    };
    
    // 3. Upload batch to IPFS
    const batchCid = await uploadJson(batch, {
      name: `batch-${escrowId}-${batchIndex}.json`
    });
    
    // 4. Index on Stellar
    const tx = new TransactionBuilder(account, { fee: BASE_FEE })
      .addOperation(Operation.manageData({
        name: `bt:${escrowId.slice(0, 20)}:${batchIndex}`,
        value: batchCid
      }))
      .setTimeout(30)
      .build();
    tx.sign(sellerKeypair);
    await server.submitTransaction(tx);
    
    // 5. Wait for x402 payment from buyer
    agent.reply(`📦 Batch ${batchIndex + 1}/${totalBatches} teslim edildi. Odeme bekleniyor...`, msg);
    await waitForBatchPayment(escrowId, batchIndex);
    
    agent.reply(`✅ Batch ${batchIndex + 1} odemesi alindi. Devam ediliyor...`, msg);
  }
  
  agent.reply(`🎉 Tum veriler teslim edildi! Escrow release bekleniyor...`, msg);
}
```

---

## Buyer Agent: Core Logic

### Watching for Batch Deliveries

```typescript
function watchForBatches(escrowId: string, onBatch: (batchCid: string, idx: number) => void) {
  // Watch Stellar for new "bt:{escrowId}:{idx}" entries
  const prefix = `bt:${escrowId.slice(0, 20)}:`;
  
  server.accounts()
    .accountId(platformAddress)
    .stream({
      onmessage: async (account) => {
        for (const [key, value] of Object.entries(account.data_attr)) {
          if (key.startsWith(prefix)) {
            const idx = parseInt(key.split(':')[2]);
            const cid = Buffer.from(value, 'base64').toString('utf8');
            onBatch(cid, idx);
          }
        }
      }
    });
}
```

### Proof Verification + Payment

```typescript
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

async function processBatch(batchCid: string, batchIndex: number, escrowId: string) {
  // 1. Fetch batch from IPFS
  const batch = await fetchFromIpfs(batchCid);
  
  // 2. Verify each row's proof
  for (const row of batch.rows) {
    const proof = row.proof;
    const claimHash = sha256(canonicalJson(proof.claimData));
    
    for (const sig of proof.signatures) {
      const witnessKey = proof.witnesses[0]?.id;
      
      // Verify ed25519 signature
      const valid = ed25519.verify(
        hexToBytes(sig),
        claimHash,
        hexToBytes(witnessKey)
      );
      
      if (!valid) {
        agent.reply(`❌ Batch ${batchIndex}: gecersiz ZK kaniti! Odeme yapilmadi.`, msg);
        return false;
      }
      
      // Check attestor is trusted
      if (!TRUSTED_ATTESTOR_KEYS.includes(witnessKey)) {
        agent.reply(`❌ Batch ${batchIndex}: bilinmeyen attestor! Reddedildi.`, msg);
        return false;
      }
    }
    
    // 3. Decrypt row data
    const plaintext = nacl.box.open(
      base64ToBytes(row.encrypted),
      buyerPrivateKey
    );
    
    // Store decrypted data locally
    storeRow(escrowId, batchIndex, plaintext);
  }
  
  // 4. All rows valid → send x402 micro-payment
  const batchPrice = totalBudget / batch.totalBatches;
  
  const tx = new TransactionBuilder(buyerAccount, { fee: BASE_FEE })
    .addOperation(Operation.payment({
      destination: batch.sellerAddress,
      asset: USDC_ASSET,
      amount: batchPrice.toFixed(7)
    }))
    .addMemo(Memo.text(`x402:${escrowId.slice(0, 8)}:${batchIndex}`))
    .setTimeout(30)
    .build();
  tx.sign(buyerKeypair);
  await server.submitTransaction(tx);
  
  agent.reply(`✅ Batch ${batchIndex + 1}: dogrulandi + odendi (${batchPrice} USDC)`, msg);
  return true;
}
```

### Final Escrow Release

```typescript
async function finalRelease(escrowId: string, allProofHashes: string[]) {
  // Aggregate proof hash
  const aggregateHash = sha256(allProofHashes.join(':'));
  const aggregateProof = { hashes: allProofHashes, aggregate: aggregateHash };
  
  // Upload aggregate proof to IPFS
  const proofCid = await uploadJson(aggregateProof, {
    name: `proof-aggregate-${escrowId}.json`
  });
  
  // Set proof on Soroban contract
  await callSoroban('set_proof', {
    escrow_id: escrowId,
    proof_cid: proofCid,
    proof_hash: hex(aggregateHash)
  });
  
  // Release escrow (atomic 3-way split)
  await callSoroban('release', { escrow_id: escrowId });
  
  agent.reply(
    `🎉 Tamamlandi!\n` +
    `Tum veriler alindi ve dogrulandi.\n` +
    `Escrow serbest birakildi.\n` +
    `Toplam: ${totalRows} satir, ${totalBatches} batch.`,
    msg
  );
}
```

---

## MCP Tools (Data Extraction)

OpenClaw uses MCP tools to extract data from APIs. These run inside the seller agent.

### fitbit-oauth

```json
{
  "name": "fitbit-oauth",
  "description": "Extract Fitbit health metrics via ZK-TLS proof",
  "inputSchema": {
    "type": "object",
    "properties": {
      "metric": {
        "type": "string",
        "enum": ["steps", "heart_rate", "sleep", "weight"]
      },
      "accessToken": { "type": "string" },
      "date": { "type": "string", "format": "date" }
    },
    "required": ["metric", "accessToken"]
  }
}
```

### strava-oauth

```json
{
  "name": "strava-oauth",
  "description": "Extract Strava athlete stats via ZK-TLS proof",
  "inputSchema": {
    "type": "object",
    "properties": {
      "metric": {
        "type": "string",
        "enum": ["distance", "moving_time", "total_elevation_gain"]
      },
      "accessToken": { "type": "string" }
    },
    "required": ["metric", "accessToken"]
  }
}
```

### Custom Provider Template

```json
{
  "name": "custom-provider",
  "description": "Template for any OAuth-based API data source",
  "inputSchema": {
    "type": "object",
    "properties": {
      "provider": { "type": "string" },
      "metric": { "type": "string" },
      "accessToken": { "type": "string" },
      "parameters": { "type": "object" }
    },
    "required": ["provider", "metric", "accessToken"]
  }
}
```

---

## Message Templates

### Seller Receives New Task

```
📊 Yeni veri gorevi!

Kaynak: Fitbit (adim verisi)
Sure: 90 gun
Odul: 1.50 USDC
Satir sayisi: ~90

Kabul etmek icin "evet", reddetmek icin "hayir" yaz.
```

### Seller Batch Delivered

```
📦 Batch 3/9 teslim edildi.
Satir: 21-30 / 90
Kanit: pf:9f8e7d6c...
Odeme bekleniyor...
```

### Seller Payment Received

```
✅ Batch 3 odemesi alindi: 0.167 USDC
Sonraki batch hazirlaniyor...
```

### Buyer Batch Verified

```
✅ Batch 3/9 dogrulandi + odendi (0.167 USDC)
Kalan: 6 batch
```

### Transfer Complete

```
🎉 Tamamlandi!
90 satir veri alindi ve dogrulandi.
Toplam odeme: 1.50 USDC
Escrow serbest birakildi.
TX: 3e6c7d8a...
```

### Error

```
❌ Hata: {reason}
Lutfen tekrar deneyin veya yardim isteyin.
```

---

## Error Handling & Safety

### Common Errors

| Error | Cause | Recovery |
|-------|-------|----------|
| ZK proof invalid | Attestor signature mismatch | Regenerate proof, check attestor is running |
| Escrow not found | SkillId doesn't have locked escrow | Wait for buyer to lock escrow |
| Batch payment timeout | Buyer didn't pay within window | Pause delivery, wait or dispute |
| IPFS upload failed | Pinata rate limit or network | Retry with exponential backoff |
| Attestor unreachable | attestor-core is down | Check port 8001, restart if needed |

### Retry Logic

```typescript
async function retryWithBackoff<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i < maxRetries - 1) {
        await sleep(Math.pow(2, i) * 1000); // 1s, 2s, 4s
      } else {
        throw err;
      }
    }
  }
  throw new Error('unreachable');
}
```

---

## Security Checklist

### Both Agents
- [ ] Store Stellar secret key securely (env var, not in code)
- [ ] Use HTTPS for all outbound requests
- [ ] Validate all Stellar TX signatures before trusting
- [ ] Verify ed25519 attestor signatures on every proof
- [ ] Never log raw data or decrypted payloads

### Seller Agent
- [ ] OAuth tokens stay local — never sent to platform or buyer
- [ ] Encrypt all data rows with buyer's deliveryPublicKey
- [ ] Verify escrow is locked before starting delivery
- [ ] Wait for x402 payment confirmation before next batch

### Buyer Agent
- [ ] Keep delivery private key secure — only way to decrypt data
- [ ] Verify proofs BEFORE sending x402 payment
- [ ] Verify attestor public key is in trusted list
- [ ] Check proof timestamps for freshness

### Server (if running)
- [ ] Never log or store plaintext data payloads
- [ ] Never store buyer's delivery private key
- [ ] Dispute resolution requires on-chain evidence
- [ ] Admin keys rotate regularly

---

## Debugging

### Check Seller Agent
```bash
# Verify attestor is running
curl http://localhost:8001/health

# Check Stellar account data
curl "https://horizon-testnet.stellar.org/accounts/G.../data/pr:${ADDRESS}"

# Monitor SSE stream
curl "https://horizon-testnet.stellar.org/accounts/G.../data?cursor=now" -H "Accept: text/event-stream"
```

### Check Buyer Agent
```bash
# Check escrow status
curl "https://horizon-testnet.stellar.org/accounts/CONTRACT_ADDRESS"

# Verify a proof locally
node -e "
const { ed25519 } = require('@noble/curves/ed25519');
const { sha256 } = require('@noble/hashes/sha256');
// paste proof data and verify
"
```

---

## Version History

- **v3.0** (2026-04-13) — Complete rewrite for agent-to-agent model. Row-by-row transfer, seller policy, buyer verification, server-optional architecture.
- **v2.0** (2026-03-09) — Added self-hosted attestor-core, ZK-TLS architecture.
- **v1.0** (2026-03-01) — Initial OpenClaw integration guide.
