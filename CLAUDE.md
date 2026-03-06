# CLAUDE.md
Proje hafızası ve çalışma notları.
Güncelleme: 2026-03-06 | Versiyon: 1.2

## Projenin Kısa Tanımı

dataEconomy, Stellar testnet üzerinde çalışan privacy-preserving veri ekonomisi altyapısıdır.
Platform yalnızca facilitator rolündedir; ham veriyi tutmaz.

## Güncel Mimari Kararlar

1. **Frontend-first publish:** Skill/MCP payload'ları frontend'den Pinata'ya yüklenir.
2. **Frontend-first chain write:** CID indexleme Freighter ile frontend'den yapılır.
3. **Backend awareness-only:** Backend sadece `notify` ile tx/cid farkındalığı ve orchestration yapar.
4. **X402 enforcement:** Proof submit akışı middleware ile ödeme başlığı doğrulaması alır.
5. **Contract-level creator split:** MCP creator ücreti backend transferi yerine escrow kontrat release fonksiyonunda dağıtılır.
6. **Encrypted delivery:** Skill metadata'da `deliveryPublicKey` tutulur; facilitator plaintext görmez.

## Aktörler

- **Buyer:** Skill oluşturur, escrow lock eder, encrypted sonucu callback ile alır.
- **Seller/OpenClaw:** On-chain/IPFS verisini okuyup policy'e göre proof + encrypted payload üretir.
- **MCP Creator:** Marketplace standardı üretir, kontrat dağıtımından creator payı alır.
- **Facilitator API:** Policy/proof/x402 kontrolleri ve callback yönlendirmesi yapar.

## Kod Alanları

- `apps/web`: buyer/seller/provider/marketplace/tasks/proofs/escrow/dashboard
- `apps/api/src/routes`: `auth`, `skills`, `notify`, `proofs`, `consent`, `escrow`, `provider`, `marketplace`
- `packages/storage`: escrow adapter + tipler
- `contracts/escrow`: release, refund, dispute ve MCP fee split fonksiyonları
- `AGENT.md`: OpenClaw production runbook
- `FLOW.md`: uçtan uca flow

## Operasyon Kuralları

- Facilitator ham veriyi loglamaz/saklamaz.
- Callback'e sadece şifreli payload iletilir.
- Ödeme ve state geçişleri mümkün olduğunca kontrat seviyesinde tutulur.
- X402 kontrolü başarısızsa proof kabul edilmez.

## Bilinen Sınırlar

- Web build bazı CI/kapalı ağ ortamlarda Google Fonts erişimi nedeniyle kırılabilir.
- ZK-TLS tarafında üretim attestor pipeline'ı hâlâ geliştirme/sertleştirme gerektirir.
- Dispute/FHE hakemlik süreci Phase 2 kapsamındadır.

## Güncel Klasör Yapısı

<<<<<<< HEAD
---

## Veri Türleri

### API Verisi (MVP)
- Web API'si olan her kaynak: Fitbit, Strava, Plaid, Spotify, GitHub, Google Fit, bank API'leri...
- zkTLS (Reclaim Protocol) ile kanıtlanır — zaman damgalı
- Doğrulama: ZK imza + timestamp + provider eşleşme + tekrar gönderim kontrolü

### Device/Cihaz Verisi (Phase 2)
- Cihazdan doğrudan alınan veri (sensör, GPS, kamera...)
- Çalışma zamanı doğrulaması: gerçekten cihazda çalıştırıldı mı? (TEE, runtime attestation)
- ZK ile doğrulama, ileride FHE ile spesifik aralık sorguları
- Örnek: "yaşı 25-35 arası mı?" sorusuna evet/hayır — kesin yaş gizli

---

## Referans Kaynaklar

Bu linkleri session başında tara. Özellikle SDK versiyonları ve API değişiklikleri için.

**Reclaim Protocol**
https://github.com/reclaimprotocol
ZK-TLS proof altyapısı. JS SDK ile proof üretimi ve doğrulaması.

**X402 — HTTP Ödeme Protokolü (Stellar)**
https://developers.stellar.org/docs/build/apps/x402
https://github.com/coinbase/x402
https://github.com/OpenZeppelin/openzeppelin-relayer
Stellar'da Soroban authorization ile çalışıyor. OpenZeppelin Relayer x402 Plugin: /verify, /settle, /supported. SDK: @openzeppelin/relayer-sdk. Testnet facilitator: https://channels.openzeppelin.com/x402/testnet

**Stellar ZK Proofs (Protocol 25 X-Ray)**
https://developers.stellar.org/docs/build/apps/zk
Native BN254 + Poseidon host functions. On-chain ZK proof verification (Groth16, RISC Zero zkVM, Circom). Reclaim proof'ları on-chain doğrulanabilir olabilir.

**OpenClaw**
https://github.com/nicholasgriffintn/openclaw
Self-hosted AI gateway. WhatsApp/Telegram/Discord. MCP tool desteği, /hooks/agent endpoint.

**Stellar Testnet**
https://laboratory.stellar.org
Test hesabı, Friendbot, TX izleme.

**Stellar Docs**
https://developers.stellar.org/docs
Soroban smart contract deployment, USDC SAC işlemleri.

**Stellar Docs Monorepo (`stellar-docs`)**
https://github.com/stellar/stellar-docs
Resmi Stellar dokümantasyon kaynağı. Bu repo lokal olarak `.external/stellar-docs` içine klonlanabilir; GitHub ajanları bu link üzerinden doğrudan `stellar-docs` içeriğini referans almalı.

**Pinata IPFS**
https://pinata.cloud
Skill JSON'ları + MCP standartları burada saklanacak.

---

## Tam Akış (Özet)

Detaylı akış FLOW.md'de. Burada kısa özet:

1. **Veri İsteyen** → MCP/skill oluşturur veya marketplace'den seçer → USDC escrow'a kilitler
2. **Marketplace** → MCP creator'lar standart yükler → kullanım başı kazanç → geri bildirim kontratı
3. **Platform** → Uygun sağlayıcıları bilgilendirir (site + OpenClaw)
4. **Veri Sağlayıcı** → Kabul eder → Consent TX Stellar'a yazılır
5. **OpenClaw** → Stellar SSE dinler → Veriyi çeker → ZK proof üretir (Reclaim zkTLS)
6. **Proof Teslimi** → Platform'a POST (X402 spam fee, Stellar USDC) → verifyProof()
7. **Escrow Release** → %70 sağlayıcı / %20 platform / %10 dispute (atomik, Stellar Soroban)
8. **Sonuç Teslimi** → Talep edene şifreli veri + proof paketi
9. **Geri Bildirim** → Akıllı kontrat ile marketplace MCP kalite değerlendirmesi

---

## Mimari Kararlar (Değişmez)

Kullanıcı kararı siteye de gelir, OpenClaw'a da. İkisi paralel çalışır.

Skill JSON iki parçalı. Public kısım IPFS'te açık. Private kısım şifreli, sadece platform okur.

**Ödeme mimarisi — tamamı Stellar ağında:**
- Escrow: Soroban contract, USDC SAC, 3-way release
- X402: Stellar + USDC (OpenZeppelin Relayer x402 Plugin) — spam koruması + veri teslimi garantisi
- MCP creator ödemesi: Kullanım başı mikro ödeme (Stellar kontrat ile)
- Tüm ödemeler Stellar testnet üzerinden. Base/Ethereum kullanılmıyor.

X402 altyapı: **OpenZeppelin Relayer x402 Plugin** + @openzeppelin/relayer-sdk.
Backend framework: **Hono**.

ZK-TLS için Reclaim Protocol. Sıfırdan ZK yazılmıyor.

**Veri türleri:**
- API verisi → MVP (zkTLS ile kanıtlanır)
- Device/cihaz verisi → Phase 2 (TEE + runtime attestation, ileride FHE)

Web API'si olan her kaynak MVP kapsamında — onay sürecinden geçer.

---

## Yapılacaklar Sırası

### Tamamlanan ✓

- Soroban escrow contract (Rust) — 5 test geçti
- packages/stellar — Horizon SSE + consent TX
- packages/reclaim — zkFetch Fitbit/Strava + verifyProof
- packages/ipfs — Pinata upload/download
- packages/pseudonym — HMAC pseudo_id
- apps/api (Hono) — skills, proofs, consent, auth route'ları
  - GET /api/auth/challenge — 5 dakika geçerli tek kullanımlık nonce
  - POST /api/auth/verify — Ed25519 imza doğrulama + pseudoId üretimi
  - POST /api/skills — gerçek IPFS upload (PINATA_JWT varsa)
  - POST /api/proofs/submit — gerçek verifyDataProof()
  - POST /api/consent/notify — stellarAddress → pseudoId otomatik türetme
- apps/web (Next.js) — Stellar cüzdan girişi
  - src/hooks/useFreighter.ts — Freighter bağlantı + imzalama hook
  - src/app/(auth)/login/page.tsx — 4 adımlı wallet connect akışı
  - NextAuth: Stellar CredentialsProvider (email/password kaldırıldı)
- apps/web sayfalar — provider, proofs, escrow, dashboard (OpenClaw + LLM proof)
- apps/api — provider route (register, list, me, bot-config)
- apps/api — proofs route (submit, llm-verify, list, :skillId)
- AGENT.md — OpenClaw entegrasyon kılavuzu (v1.0)
- Stellar testnet hesabı oluşturuldu (GBF32...LG6K)
- GitHub private repo: https://github.com/AltndrekBurk/databankonstelalr

## Auth Akışı (Stellar Wallet)

```
1. "Freighter ile Bağlan" → Freighter extension açılır
2. Public key alınır (G... 56 karakter)
3. GET /api/auth/challenge?address=G... → challenge string
4. Freighter ile challenge imzalanır (signMessage)
5. NextAuth credentials: { publicKey, signature, challenge }
6. POST /api/auth/verify → Ed25519 doğrulama → pseudoId üretimi
7. Session: { stellarAddress, pseudoId } — gerçek kimlik hiçbir yerde saklanmaz
```

### Sonraki adımlar

1. Stellar testnet hesabı + Friendbot ile XLM al, escrow deploy et
2. X402 middleware'i `proofs/submit` route'una bağla (Stellar + USDC, OpenZeppelin Relayer)
3. **Marketplace sayfası** — MCP listeleme, arama, filtreleme, upload, rating
4. **MCP oluşturucu** — Veri çekme standardı oluşturma formu + IPFS upload
5. **Veri sağlayıcı kayıt** — API/Device türü seçimi, OpenClaw bot ayarları
6. **Görev listesi** — Bekleyen görevler + kabul/red + durum takibi
7. **Dashboard** — Kazançlar, aktif görevler, proof durumu, escrow takibi
8. **Geri bildirim kontratı** — Soroban ile MCP kalite değerlendirmesi
9. AGENT.md yaz — OpenClaw için direktifler
10. Gerçek Stellar TX — consent.ts'deki mock kaldır

---

## Açık Sorular

~~Reclaim'de Fitbit provider var mı?~~ **ÇÖZÜLDÜ:** Resmi built-in yok. `@reclaimprotocol/zk-fetch` ile custom yazılacak.

~~X402 Stellar'ı destekliyor mu?~~ **ÇÖZÜLDÜ:** Evet, Stellar'da var! OpenZeppelin Relayer x402 Plugin ile Soroban authorization üzerinden çalışıyor. Testnet facilitator: https://channels.openzeppelin.com/x402/testnet. Kaynak: https://developers.stellar.org/docs/build/apps/x402

~~OpenClaw'a dışarıdan mesaj göndermek için API var mı?~~ **ÇÖZÜLDÜ:** Evet, `POST /hooks/agent` endpoint'i var.

~~Stellar memo 28 byte sınırı~~ **ÇÖZÜLDÜ:** Escrow contract kullanıldığı için memo'ya gerek yok.

Kullanıcı cüzdanı yönetimi: Freighter extension mi zorunlu, yoksa başka yol var mı?

MCP marketplace creator ödemesi: Kullanım başı mikro ödeme kontrat tasarımı?

Device veri doğrulama: TEE + runtime attestation hangi araçlarla? (Phase 2)

---

## Veri Kaynağı Onay Süreci (MVP)

Web API'si olan her kaynak platforma önerilebilir. Onay kriterleri:

1. Kaynağın web API'si var mı? (public veya OAuth)
2. Reclaim Protocol ile provider yazılabilir mi? (TLS session kaydedilebiliyor mu)
3. Kullanıcı bu kaynağa erişim yetkisi verebilir mi?

Üçü "evet" ise kaynak onaylanır, provider yazılır, marketplace'e eklenir.

---

## Phase 2 (MVP Sonrası — Dokunma)

Device/cihaz verisi (sensör, GPS, kamera) — TEE + runtime attestation gerekli.
FHE ile spesifik aralık sorguları (ör: yaş aralığı, gelir bandı) — Phase 2/3.
Browser extension — platform kısıtlamaları, Phase 3.
KYC — traction sonrası.
Multi-chain — önce Stellar'da kanıtla.
Token/tokenomics — önce ürün çalışsın.

---

## Teknik Riskler

~~Reclaim custom provider yazımı~~ → Aşağıdaki KRİTİK AŞAMA'ya bak.

~~Soroban USDC işlemleri~~ **ÇÖZÜLDÜ:** `token::TokenClient::new(&env, &usdc_sac_id)` ile SEP-41 arayüzü.

~~OpenClaw programatik mesaj~~ **ÇÖZÜLDÜ:** `/hooks/agent` endpoint'i ile mümkün.

MCP marketplace geri bildirim kontratı henüz tasarlanmadı — escrow pattern'i üzerine inşa edilebilir.

---

## ⚠️ KRİTİK AŞAMA: ZK-TLS Proof Sistemi (Simüle)

**Durum:** Şu an tüm ZK proof'lar SİMÜLE edilmiş durumda. Gerçek ZK-TLS kanıtı üretilmiyor.

**Sorun:** Reclaim Protocol'ün hosted sistemi projemize uymuyor:
1. APP_ID modeli: Her veri kaynağı için ayrı APP_ID almak gerekiyor (per-app provider)
2. Mobil uygulama zorunluluğu: QR kod taratıp mobil Reclaim app'ten onay gerekiyor
3. Bizim model: Kullanıcı herhangi bir web API'sine bağlanabilmeli, tek tek APP_ID almadan

**Çözüm:** Self-hosted `attestor-core` deploy etmek.
- Repo: https://github.com/reclaimprotocol/attestor-core
- APP_ID gerektirmez, standalone çalışır
- Sadece PRIVATE_KEY ile başlatılır, port 8001'de dinler
- zkFetch bu attestor'a yönlendirilir (Reclaim hosted yerine)

**Aktivasyon Adımları:**
```
1. git clone https://github.com/reclaimprotocol/attestor-core
2. cd attestor-core && npm install
3. .env dosyasına PRIVATE_KEY=<ed25519-private-key> ekle
4. npm run start:tsc  → port 8001'de çalışır
5. packages/reclaim/src/index.ts → zkFetch attestor URL'ini kendi sunucumuza yönlendir
6. Gerçek API'lere zkFetch çağrısı yap → gerçek ZK-TLS proof üret
```

**Etkilenen dosyalar:**
- `packages/reclaim/src/index.ts` — zkFetch attestor config
- `apps/api/src/routes/proofs.ts` — simüle proof → gerçek proof
- `apps/web/src/app/dashboard/page.tsx` — LLM proof bölümü

**Öncelik:** Bu, MVP'nin en kritik blocker'ı. Attestor-core deploy edilmeden gerçek veri doğrulaması yapılamaz.

---

## Klasör Yapısı

```text
dataEconomy/
├── apps/
│   ├── web/                      Next.js 16 UI
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
│   └── api/
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
│   ├── pseudonym/
│   └── storage/
├── contracts/
│   ├── escrow/
│   └── feedback/
├── AGENT.md
├── FLOW.md
├── README.md
└── CLAUDE.md
```
