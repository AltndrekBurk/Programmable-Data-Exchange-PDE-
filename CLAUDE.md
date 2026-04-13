# CLAUDE.md
Proje hafızası ve çalışma notları.
Güncelleme: 2026-04-13 | Versiyon: 2.0

## Projenin Kısa Tanımı

PDE (Programmable Data Exchange), Stellar testnet üzerinde çalışan agent-to-agent privacy-preserving veri ekonomisi protokolüdür.
Kullanıcılar OpenClaw botları üzerinden (WhatsApp/Telegram/Discord) etkileşir.
Botlar zincir üzerinden birbirini bulur ve veri alışverişi yapar.
Sunucu opsiyonel yönetim katmanıdır — çalışmasa bile sistem işler.

## Güncel Mimari Kararlar

1. **Agent-to-agent**: Buyer Agent ↔ Seller Agent. İletişim Stellar + IPFS üzerinden. Sunucu aracı değil.
2. **Server-optional**: Sunucu warm cache, push notification, dispute admin sağlar. Core flow sunucusuz çalışır.
3. **Trustless by design**: Sunucu kötü niyetli olsa bile fon çalamaz (escrow kontrat), proof sahtekarlığı yapamaz (attestor key yok), veri okuyamaz (buyer key ile şifreli).
4. **Row-by-row transfer**: Büyük veri setleri batch'ler halinde teslim edilir. Her batch: ZK proof + encrypted data + x402 mikro ödeme.
5. **Seller policy on IPFS**: Satıcılar veri politikalarını IPFS'e yükler. Agent gelen skill'leri policy'ye göre otomatik değerlendirir.
6. **Direct chain interaction**: Agent'lar Stellar'a doğrudan yazıp okur. Horizon SSE ile event dinler.
7. **Contract-level payments**: Escrow release, split'ler, MCP fee — hepsi atomik Soroban operasyonları.
8. **Encrypted delivery**: Buyer'ın `deliveryPublicKey`'i skill metadata'da. Seller bu key ile şifreler. Kimse decrypt edemez.
9. **Self-hosted attestor-core**: Bağımsız TLS witness. Seller veriyi sahteleyemez, sunucu proof'u sahteleyemez.

## Aktörler

- **Buyer Agent (OpenClaw):** Kullanıcının botu. Skill oluşturur, escrow kilitler, proof doğrular, batch ödemesi yapar, veriyi decrypt eder.
- **Seller Agent (OpenClaw):** Sağlayıcının botu. Policy yayınlar, skill'leri değerlendirir, ZK proof üretir, satır satır şifreli veri teslim eder.
- **MCP Creator:** Marketplace standardı üretir, kontrat seviyesinde kullanım başı kazanç alır.
- **PDE Server (opsiyonel):** Warm cache, push notification, dispute admin, analytics.
- **Attestor-Core:** Bağımsız TLS witness. Source API'lere kendi TLS bağlantısını açar, gördüğünü imzalar.

## Kod Alanları

- `apps/web`: Dashboard, marketplace, escrow, proofs (opsiyonel web UI)
- `apps/api/src/routes`: `auth`, `skills`, `notify`, `proofs`, `consent`, `escrow`, `provider`, `marketplace` (opsiyonel governance)
- `packages/stellar`: Horizon SSE + consent TX builders
- `packages/reclaim`: zkFetch + ed25519 proof verification
- `packages/ipfs`: Pinata upload/download
- `packages/storage`: escrow adapter (Soroban) + warm cache
- `contracts/escrow`: deposit, set_proof, release, dispute, timeout
- `contracts/feedback`: MCP registry, ratings, CID history
- `AGENT.md`: OpenClaw agent kılavuzu (buyer + seller)
- `FLOW.md`: Agent-to-agent uçtan uca flow

## Operasyon Kuralları

- Sunucu ham veriyi asla loglamaz/saklamaz.
- Şifreli payload dışında veri taşınmaz.
- Ödeme ve state geçişleri kontrat seviyesinde.
- Sunucu çalışmasa bile agent'lar zincir üzerinden işlem yapabilir.
- Proof doğrulama agent tarafında yapılabilir (sunucu gerekli değil).

## Bilinen Sınırlar

- ZK-TLS: Attestor-core henüz deploy edilmedi. Proof'lar simüle.
- Row-by-row batch transfer: Protokol tasarlandı, kod implementasyonu devam ediyor.
- Dispute/FHE hakemlik: Phase 2 kapsamında.
- Web build bazı CI/kapalı ağ ortamlarda Google Fonts nedeniyle kırılabilir.

---

## Veri Türleri

### API Verisi (MVP)
- Web API'si olan her kaynak: Fitbit, Strava, Plaid, Spotify, GitHub, Google Fit, bank API'leri...
- zkTLS (Reclaim Protocol) ile kanıtlanır — zaman damgalı
- Doğrulama: ZK imza + timestamp + attestor key eşleşme + tekrar gönderim kontrolü

### Device/Cihaz Verisi (Phase 2)
- Cihazdan doğrudan alınan veri (sensör, GPS, kamera...)
- TEE + runtime attestation, ileride FHE
- Örnek: "yaşı 25-35 arası mı?" evet/hayır — kesin yaş gizli

---

## Referans Kaynaklar

**Reclaim Protocol** https://github.com/reclaimprotocol
**X402 on Stellar** https://developers.stellar.org/docs/build/apps/x402
**OpenZeppelin Relayer** https://github.com/OpenZeppelin/openzeppelin-relayer
**Stellar ZK (Protocol 25)** https://developers.stellar.org/docs/build/apps/zk
**OpenClaw** https://github.com/nicholasgriffintn/openclaw
**Stellar Testnet** https://laboratory.stellar.org
**Stellar Docs** https://developers.stellar.org/docs
**Pinata IPFS** https://pinata.cloud
**X402 Protocol** https://github.com/coinbase/x402

---

## Agent-to-Agent Akış (Özet)

Detaylı akış FLOW.md'de. Kısa özet:

1. **Seller** → Policy'sini IPFS'e yükler, Stellar'da indexler
2. **Buyer** → Skill oluşturur (veri isteği), IPFS + Stellar'a yazar
3. **Seller Agent** → SSE ile yeni skill'i algılar → policy'ye göre değerlendirir
4. **Seller** → Kabul ederse consent TX'i Stellar'a yazar
5. **Buyer Agent** → Consent'i SSE ile algılar → USDC escrow'a kilitler (Soroban)
6. **Seller Agent** → Escrow kilidini algılar → zkFetch ile veri çeker → attestor-core imzalar
7. **Row-by-row**: Her batch için: ZK proof + encrypted data → IPFS → Stellar index
8. **Buyer Agent** → Batch'i alır → proof doğrular → x402 mikro ödeme gönderir
9. **Tekrar**: 7-8 tüm batch'ler bitene kadar
10. **Buyer Agent** → Tüm veri alındı → Soroban escrow release → %70 seller / %20 platform / %10 dispute
11. **Feedback** → MCP kalite değerlendirmesi (Soroban feedback contract)

---

## Mimari Kararlar (Değişmez)

**Agent-first, server-optional.** Sunucu convenience katmanı.

**Ödeme mimarisi — tamamı Stellar ağında:**
- Escrow: Soroban contract, USDC SAC, 3-way release
- x402 mikro ödeme: Batch başına buyer→seller USDC transferi
- MCP creator: Kullanım başı mikro ödeme (kontrat seviyesi)
- Tüm ödemeler Stellar testnet. Base/Ethereum kullanılmıyor.

**ZK-TLS:** Reclaim Protocol + self-hosted attestor-core. Sıfırdan ZK yazılmıyor.
**Backend framework:** Hono (opsiyonel governance API).
**Agent gateway:** OpenClaw (WhatsApp/Telegram/Discord).

---

## Yapılacaklar Sırası

### Tamamlanan ✓

- Soroban escrow contract (Rust) — 5 test geçti
- packages/stellar — Horizon SSE + consent TX
- packages/reclaim — zkFetch Fitbit/Strava + verifyProof
- packages/ipfs — Pinata upload/download
- apps/api (Hono) — tüm route'lar çalışıyor
- apps/web (Next.js) — Stellar wallet login + tüm sayfalar
- AGENT.md v3.0 — Agent-to-agent kılavuzu
- FLOW.md v3.0 — Agent-to-agent flow
- pseudoId sistemi kaldırıldı → doğrudan stellarAddress
- @dataeconomy → @pde rename tamamlandı
- Eski pre-monorepo kalıntıları temizlendi
- Stellar testnet hesabı (GBF32...LG6K)

### Sonraki adımlar

1. **Attestor-core deploy** — MVP'nin #1 blocker'ı
2. **Batch transfer protokolü** — Row-by-row x402 + ZK proof kodu
3. **Seller policy model** — IPFS'e policy upload + auto-evaluation
4. **Agent SSE listener** — Stellar event stream'den skill/consent/escrow algılama
5. **x402 mikro ödeme** — Batch başına USDC transfer
6. **Agent keypair management** — OpenClaw bot'ların Stellar keypair'leri
7. **Escrow timeout handling** — refund_if_expired() otomasyonu
8. **Dispute admin panel** — Web UI dispute çözüm arayüzü

---

## Açık Sorular

~~Reclaim'de Fitbit provider var mı?~~ **ÇÖZÜLDÜ:** Custom zkFetch ile yazılacak.
~~X402 Stellar'ı destekliyor mu?~~ **ÇÖZÜLDÜ:** Evet, OpenZeppelin Relayer x402 Plugin.
~~OpenClaw programatik mesaj?~~ **ÇÖZÜLDÜ:** POST /hooks/agent endpoint'i.
~~Stellar memo 28 byte sınırı~~ **ÇÖZÜLDÜ:** Escrow contract ile çözüldü.

Agent keypair yönetimi: OpenClaw bot Stellar secret key'i nasıl güvenli saklayacak?
Batch transfer abort: Buyer yarıda bırakırsa kalan escrow ne olacak? (dispute vs timeout)
Multi-attestor: Birden fazla attestor'dan proof alınabilir mi? (güvenilirlik artışı)
Device veri doğrulama: TEE + runtime attestation (Phase 2)

---

## ⚠️ KRİTİK AŞAMA: ZK-TLS Proof Sistemi

**Durum:** Tüm ZK proof'lar SİMÜLE. Gerçek kanıt üretilmiyor.

**Çözüm:** Self-hosted `attestor-core` deploy etmek.
- Repo: https://github.com/reclaimprotocol/attestor-core
- APP_ID gerektirmez, standalone, sadece PRIVATE_KEY, port 8001
- zkFetch bu attestor'a yönlendirilir

**Öncelik:** MVP'nin en kritik blocker'ı.

---

## Phase 2 (MVP Sonrası — Dokunma)

- Device/cihaz verisi — TEE + runtime attestation
- FHE ile aralık sorguları (yaş, gelir bandı)
- Browser extension
- KYC — traction sonrası
- Multi-chain — önce Stellar'da kanıtla
- Token/tokenomics — önce ürün çalışsın

---

## Klasör Yapısı

```text
dataEconomy/
├── apps/
│   ├── web/                      Next.js 16 UI (opsiyonel dashboard)
│   │   └── src/app/
│   │       ├── (auth)/login
│   │       ├── buy/
│   │       ├── sell/
│   │       ├── provider/
│   │       ├── marketplace/ (+[id], /upload)
│   │       ├── skills/create/
│   │       ├── tasks/
│   │       ├── proofs/
│   │       ├── escrow/
│   │       └── dashboard/
│   └── api/                      Hono (opsiyonel governance)
│       └── src/routes/
│           ├── auth.ts
│           ├── skills.ts
│           ├── notify.ts
│           ├── proofs.ts
│           ├── consent.ts
│           ├── escrow.ts
│           ├── provider.ts
│           ├── marketplace.ts
│           └── dashboard.ts
├── packages/
│   ├── ipfs/
│   ├── stellar/
│   ├── reclaim/
│   └── storage/
├── contracts/
│   ├── escrow/
│   └── feedback/
├── AGENT.md                      OpenClaw agent guide (v3.0)
├── FLOW.md                       Agent-to-agent flow (v3.0)
├── README.md
└── CLAUDE.md
```
