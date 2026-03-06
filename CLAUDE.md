# CLAUDE.md
Proje hafızası ve çalışma talimatları.
Her session başında bu dosyayı oku, sonra ilgili dokümantasyon linklerini tara.
Güncelleme: 2026-03-01 | Versiyon: 1.0

---

## Session Başlangıç Rutini

Her yeni session açıldığında sırayla şunları yap:

1. Bu dosyayı baştan sona oku
2. FLOW.md'yi oku — tam akış orada
3. Aşağıdaki "Referans Kaynaklar" bölümündeki linkleri tara — özellikle değişmiş olabilecek API'ler için
4. Açık sorular bölümüne bak, çözülmüş olanları güncelle
5. Sonra göreve başla

---

## Projenin Özü

Privacy-preserving data economy facilitator on Stellar testnet.

Platform bir **aracı (facilitator)** — ham veriye dokunmaz. Üç temel işlevi var:
1. **Skill broker** — Veri taleplerini (MCP/skill) yönetir, marketplace işletir
2. **Proof verifier** — ZK proof'ları doğrular
3. **Escrow yönetimi** — Ödemeyi otomatik dağıtır

### Marketplace
Kullanıcılar veri çekme standartları (MCP tool) oluşturup marketplace'e yükler. Başkaları bu standartları kullanırsa creator'a kullanım başı ödeme yapılır. Bu sayede sistem topluluk tarafından genişler.

---

## Aktörler

**Veri İsteyen** — Siteye gelir, MCP/skill oluşturur VEYA marketplace'den hazır olanı seçip özelleştirir, USDC escrow'a kilitler, kanıtlanmış veri paketini alır(xk-tls kaynağı ve zamanı). 

**MCP Creator** — Veri çekme standardı oluşturup marketplace'e yükler (IPFS'e). Birisi standardını kullanırsa kullanım başı kazanç alır. Akıllı kontrat ile kullanılabilirlik değerlendirmesi yapılır.

**Veri Sağlayıcı** — OpenClaw bot kullanıcısı. Siteye kaydolur, desteklediği veri türünü (API/Device/fhe veri aralığı net değer / zk - seçeneki sorular için) işaretler. Siteden veya WhatsApp/Telegram'dan görev kabul eder. Kabul ederse Stellar'a consent TX yazılır.

**Platform (biz)** — Facilitator. Skill'i IPFS'e yükler, Stellar'a kaydeder, sağlayıcılara iletir, proof'u doğrular, escrow'u tetikler, talep edene sonucu teslim eder. Ham veriye hiçbir zaman dokunmaz.-- ipfs ye forntend app den hereks kendi yüklemesi lazımdı ama bazıalrı öyle bazıları böyle şuanlık veri iletimi şifreli

**OpenClaw** — Kullanıcının self-hosted AI gateway'i. Platform `POST /hooks/agent` ile mesaj gönderir (`channel: "whatsapp"`, `to: "+90..."`), kullanıcı mesajlaşma uygulamasından karar verir. OpenClaw Stellar'ı dinler, veriyi çeker, ZK proof üretir aslında zk-tls veri https doğrulama, platforma gönderir.

**Stellar** — İki rol: event bus (consent kararı on-chain) ve escrow (USDC kilidi). Soroban escrow contract Rust ile yazılıyor. 3-way release (sağlayıcı %70 / platform %20 / dispute %10) tek TX ile atomik. **Asıl ödeme Stellar ağında.** Testnet USDC SAC: `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA`

**Reclaim Protocol** — ZK-TLS altyapısı. "Bu veri gerçekten X API'sinden geldi" kanıtını üretiyor. SDK: `@reclaimprotocol/js-sdk` + `@reclaimprotocol/zk-fetch`. X uygulaması için built-in provider yok — `zkFetch` ile custom yazılıyor.

**X402** — Coinbase'in HTTP ödeme protokolü. **Stellar'da çalışıyor** (Soroban authorization + OpenZeppelin Relayer x402 Plugin). Proof tesliminde spam engeli, veri tesliminde ödeme garantisi. Tüm X402 ödemeleri Stellar testnet üzerinden USDC ile.

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

```
dataEconomy/                      ← monorepo root (npm workspaces)
├── apps/
│   ├── web/                      Next.js 16 — tüm kullanıcı arayüzü (port 3000)
│   │   └── src/
│   │       ├── app/(auth)/       Login (Freighter wallet)
│   │       ├── app/marketplace/  MCP marketplace (TODO)
│   │       ├── app/skills/       Skill/MCP oluşturma (TODO)
│   │       ├── app/tasks/        Görev listesi (TODO)
│   │       ├── app/dashboard/    Dashboard (TODO)
│   │       ├── hooks/            useFreighter vs
│   │       └── components/ui/    Button vs
│   └── api/                      Hono — tüm backend (port 3001)
│       └── src/routes/
│           ├── auth.ts           GET /challenge, POST /verify
│           ├── skills.ts         Skill oluşturma/listeleme + IPFS
│           ├── proofs.ts         ZK proof submit + doğrulama (X402 spam)
│           ├── consent.ts        OpenClaw bildirim + Stellar consent TX
│           └── marketplace.ts    MCP listeleme/rating/ödeme (TODO)
├── packages/
│   ├── stellar/                  Horizon SSE + consent TX + USDC SAC
│   ├── reclaim/                  zkFetch proof + verifyProof()
│   ├── ipfs/                     Pinata upload/download + SkillJson type
│   └── pseudonym/                HMAC-SHA256 pseudo_id
├── contracts/
│   ├── escrow/                   Soroban Rust — USDC kilitleme, 3-way release
│   │   └── src/lib.rs            deposit/release/refund/dispute (5 test ✓)
│   └── feedback/                 MCP kalite değerlendirme kontratı (TODO)
├── .claude/agents/               Ajan tanımları (3 ajan)
├── CLAUDE.md                     Bu dosya
├── FLOW.md                       Detaylı akış
├── AGENT.md                      OpenClaw entegrasyon kılavuzu (v1.0, 739 satır)
└── .env.local                    Stellar keys, pseudonym secret (git'e girmez)
```

## Önemli Sabitler

```
USDC_TESTNET_SAC  = CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
HORIZON_TESTNET   = https://horizon-testnet.stellar.org
SOROBAN_TESTNET   = https://soroban-testnet.stellar.org:443
Escrow split      = %70 sağlayıcı / %20 platform / %10 dispute (atomik)
Consent memo fmt  = CONSENT:{skillId8}:{pseudoId8}:ACCEPT|REJECT
X402              = Stellar + USDC (OpenZeppelin Relayer x402 Plugin)
X402_FACILITATOR  = https://channels.openzeppelin.com/x402/testnet
Tüm ödemeler      = Stellar ağında (escrow + X402 + MCP creator)
```

---

## Çalışma Kuralları

Ham veri hiçbir zaman loglanmaz. Sadece hash loglanır.
Kullanıcı kimliği hiçbir yerde saklanmaz, sadece pseudo_id kullanılır.
Stellar işlemleri önce testnet, sonra mainnet.
Soroban contract değişikliği tam test suite olmadan deploy edilmez.
.env git'e girmez, .env.example tutulur.
Her public endpoint rate limit alır.
MCP marketplace içeriği IPFS'te, metadata blockchain'de.

---

## Güncelleme Geçmişi

2026-02-28 — v0.1 — İlk taslak
2026-02-28 — v0.2 — Büyük revizyon, kod örnekleri kaldırıldı
2026-02-28 — v0.3 — OpenClaw keşfi, referans linkler, session rutini
2026-02-28 — v0.4 — MVP kapsamı genişletildi
2026-02-28 — v0.5 — X402 araştırması: Stellar desteği yok → Base+USDC; backend Hono
2026-02-28 — v0.6 — Tüm araştırmalar tamamlandı
2026-02-28 — v0.7 — Monorepo kuruldu, escrow contract, packages/* hazır
2026-02-28 — v0.8 — Stellar wallet login (Freighter), auth route'ları
2026-03-01 — v0.9 — Marketplace + MCP creator akışı, veri türleri, geri bildirim kontratı
2026-03-01 — v1.0 — X402 Stellar'da VAR! Base+USDC referansları kaldırıldı.
                     OpenZeppelin Relayer x402 Plugin eklendi.
                     Native ZK Proofs (Protocol 25 X-Ray: BN254+Poseidon) keşfedildi.
                     Tüm ödeme altyapısı Stellar ağında birleştirildi.
2026-03-01 — v1.1 — Provider, proofs, escrow sayfaları oluşturuldu.
                     Dashboard: OpenClaw bot + LLM proof bölümü eklendi.
                     Stellar testnet hesabı (GBF32...LG6K) oluşturuldu.
                     AGENT.md v1.0 yazıldı (739 satır OpenClaw kılavuzu).
                     GitHub private repo push edildi.
                     KRİTİK AŞAMA: ZK-TLS proof sistemi simüle.
                     Çözüm: self-hosted attestor-core (APP_ID gerektirmez).
