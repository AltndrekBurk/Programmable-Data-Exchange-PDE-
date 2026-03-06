# dataEconomy (Stellar + IPFS + OpenClaw)

Privacy-preserving data exchange marketplace.

Bu repo artık **frontend-first data plane** yaklaşımıyla çalışır:
- Frontend doğrudan **Pinata HTTPS API** ile IPFS'e yazar.
- Frontend doğrudan **Stellar/Soroban** işlemlerini Freighter ile imzalayıp gönderir.
- Backend, yalnızca **facilitator awareness + policy + x402 doğrulama + teslim orkestrasyonu** yapar.

## Güncel Mimari (Özet)

1. Buyer/MCP Creator skill veya MCP metadata üretir.
2. JSON payload frontend'de IPFS'e yüklenir (CID alınır).
3. CID frontend'den Stellar'a indexlenir.
4. Backend `notify` endpoint'i sadece zincir yazımını/tx hash'i kayıt altına alır.
5. Seller/OpenClaw on-chain index + IPFS üzerinden işi okur.
6. Proof submit akışı `x402` middleware ile ödeme doğrulamasından geçer.
7. Escrow release sırasında kontrat içinde provider/platform/dispute + opsiyonel MCP creator split dağıtılır.
8. Facilitator, buyer callback'ine yalnızca `encryptedPayload` iletir (plaintext tutmaz).

## Öne Çıkan Son Değişiklikler

- **X402 middleware** (`/api/proofs/submit`) aktif.
- **MCP creator fee backend transferi kaldırıldı**; payout kontrat release fonksiyonuna taşındı.
- **Delivery public key** (`deliveryPublicKey`) skill metadata'da taşınıyor.
- Frontend skill/provider publish akışları backend'e bağımlı olmadan IPFS + chain yazıyor.
- Tasks sayfasında API başarısızsa chain+IPFS fallback mevcut.

## Monorepo Yapısı

- `apps/web`: Next.js UI (buyer/seller/provider/marketplace/tasks/proofs/escrow/dashboard)
- `apps/api`: Hono facilitator API (auth, skills, notify, proofs, consent, escrow, provider, marketplace)
- `packages/*`: stellar, ipfs, reclaim, pseudonym, storage adaptörleri
- `contracts/escrow`: Soroban escrow + MCP fee split release fonksiyonları
- `AGENT.md`: OpenClaw bot/facilitator üretim runbook
- `FLOW.md`: Uçtan uca operasyon akışı
- `CLAUDE.md`: Proje hafızası ve uygulama kararları

## Hızlı Başlangıç

```bash
npm install
npm run build:packages
npm run build:api
npm run dev
```

Web: `http://localhost:3000`
API: `http://localhost:3001`

## Notlar

- `npm run build:web` bazı ortamlarda Google Fonts erişimi nedeniyle başarısız olabilir (network kısıtı).
- Kontrat değişikliklerinde `contracts/escrow` altında `cargo test` çalıştırın.
