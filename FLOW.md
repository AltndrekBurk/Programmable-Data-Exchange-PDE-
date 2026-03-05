# dataEconomy — Proje İşleyişi
Son güncelleme: 2026-03-01 (v1.0 — X402 Stellar, native ZK)

---

## Tek Cümleyle

Şirketler ve kullanıcılar veri talep eder, veri sağlayıcılar ZK proof ile kanıtlanmış veri üretir, ödeme otomatik akar. Platform facilitator — ham veriye dokunmaz.

---

## Aktörler

| Aktör | Ne Yapar |
|---|---|
| **Veri İsteyen** | Siteye gelir, MCP/skill oluşturur VEYA marketplace'den seçer, USDC escrow'a kilitler |
| **MCP Creator** | Veri çekme standardı (MCP tool) oluşturup marketplace'e yükler, kullanım başı kazanç |
| **Veri Sağlayıcı** | OpenClaw bot kullanıcısı. Siteye kaydolur, desteklediği veri türünü (API/Device) işaretler |
| **Platform (biz)** | Facilitator — skill broker, proof verifier, escrow tetikleyici. Ham veriye dokunmaz |
| **OpenClaw** | Kullanıcının self-hosted AI gateway'i. Stellar'ı dinler, veriyi çeker, ZK proof üretir |
| **Stellar** | Üç rol: consent event bus + USDC escrow kilidi + native ZK proof verification (Protocol 25 X-Ray: BN254+Poseidon) |
| **Reclaim Protocol** | ZK-TLS altyapısı — "bu veri gerçekten X API'sinden geldi" kanıtını üretir |
| **X402** | HTTP ödeme protokolü — Stellar üzerinden USDC ile. Proof gönderiminde spam engeli, veri tesliminde ödeme garantisi. OpenZeppelin Relayer x402 Plugin |

---

## Tam Akış

```
┌─────────────────────────────────────────────────────────┐
│ 1. VERİ İSTEYEN — Talep Oluşturur                       │
│                                                          │
│  A) Kendi MCP/Skill'ini oluşturur:                      │
│     Site → "Veri Talep Et" formu                        │
│     → Veri türü, kaynak, metrikler, süre, bütçe tanımlar│
│     → Skill JSON oluşur → IPFS'e yüklenir              │
│                                                          │
│  B) Marketplace'den seçer:                              │
│     → Hazır MCP standartlarını listeler/arar            │
│     → Birini seçer, özelleştirir (metrik, süre, bütçe) │
│     → MCP creator'a kullanım başı ödeme tetiklenir      │
│                                                          │
│  → Escrow adresi döner → USDC yatırılır (kilitlenir)   │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ 2. MARKETPLACE — MCP Veri Çekme Standartları             │
│                                                          │
│  MCP Creator'lar:                                       │
│  → Wallet ile giriş yapar                               │
│  → Veri çekme standardı (MCP tool) oluşturur            │
│    - Hangi API/kaynak (Fitbit, Strava, Plaid...)        │
│    - Hangi metrikler (adım, kalori, bakiye...)          │
│    - Doğrulama kuralları (ZK parametreleri)             │
│    - Frontend scriptleri (veri çekme mantığı)           │
│  → IPFS'e yükler                                        │
│  → Marketplace'te listelenir                            │
│  → Birisi kullandığında kullanım başı kazanç (kontrat)  │
│                                                          │
│  Geri Bildirim Mekanizması:                             │
│  → Akıllı kontrat ile MCP kalite değerlendirmesi        │
│  → Kullanılabilirlik skoru (wallet + pseudo_id ile oy)  │
│  → Başarılı proof oranı takibi                          │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ 3. PLATFORM — Veri Sağlayıcıya Bildirim                 │
│                                                          │
│  Uygun sağlayıcılar seçilir (pseudo_id + veri türü)    │
│                                                          │
│  Bildirim kanalları:                                    │
│  A) SİTEDE: Görev listesi → detay + [Kabul] [Red]      │
│  B) OpenClaw: POST /hooks/agent                         │
│     → WhatsApp/Telegram'a mesaj gider                   │
│     → "Yeni görev: Fitbit adım, 90 gün, 1.50 USDC"    │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ 4. VERİ SAĞLAYICI — Karar & Kayıt                       │
│                                                          │
│  İlk kayıtta:                                           │
│  → Wallet ile giriş                                     │
│  → Desteklediği veri türünü işaretler:                  │
│    • API (zkTLSekstra seçenek  ile kanıtlanır) — MVP                   │
│    • Device/Cihaz (runtime doğrulama esktra seçenek doğrulama) — Phase 2+        │
│  → OpenClaw bot ayarları (opsiyonel)                    │
│                                                          │
│  Görev geldiğinde:                                      │
│  → Sitede [Kabul] tıklar VEYA WhatsApp'tan "evet" yazar│
│  → Backend Stellar'a consent TX yazar                   │
│    memo: "CONSENT:<skillId>:<pseudoId>:ACCEPT"          │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ 5. OPENCLAW — Stellar Dinler + Veri Çeker                │
│                                                          │
│  Horizon SSE ile platform hesabını dinler               │
│  Consent TX geldi → memo parse et                       │
│                                                          │
│  API Verisi (MVP):                                      │
│  → Fitbit/Strava/Plaid OAuth ile bağlanır               │
│  → Reclaim zkFetch: TLS session kaydedilir              │
│  → Zaman damgalı ZK proof üretilir                     │
│  → Ham veri görünmez, sadece proof çıkar                │
│                                                          │
│  Device Verisi (Phase 2):                               │
│  → Cihazdan çalışma zamanı verisi alınır                │
│  → Runtime attestation: gerçekten çalıştırıldı mı?     │
│  → ZK ile doğrulama mümkün                              │
│  → İleride FHE ile spesifik aralık sorguları            │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ 6. PROOF TESLİMİ — OpenClaw → Platform                  │
│                                                          │
│  POST /api/proofs/submit                                │
│  Header: X-Payment (X402, USDC on Stellar testnet)          │
│  Body: { skillId, pseudoId, proof, delivery.encryptedPayload } │
│                                                          │
│  Platform doğrulama zinciri:                            │
│    1. X402 ödeme doğrulama (spam engeli)                │
│    2. verifyDataProof(proof) — Reclaim ZK doğrulama     │
│    3. Timestamp kontrolü (consent sonrası mı?)          │
│    4. Provider eşleşme (Fitbit = Fitbit mi?)            │
│    5. Tekrar gönderim kontrolü                          │
│    6. Agent doğrulama (gerçekten OpenClaw botu mu?)     │
│    7. Buyer callbackUrl (skill.callbackUrl) resolve edilir │
│    8. encrypted payload buyer'a HTTPS POST edilir        │
│    9. Proof hash → Stellar'a yazılır                    │
│   10. Soroban escrow release() tetiklenir               │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ 7. ESCROW RELEASE — Stellar (Atomik)                     │
│                                                          │
│  Soroban contract release() çalışır:                    │
│    %70 → Veri sağlayıcı (Stellar cüzdanı)              │
│    %20 → Platform                                       │
│    %10 → Dispute havuzu                                 │
│  3 transfer tek TX'te atomik — ya hepsi ya hiç          │
│                                                          │
│  MCP Creator Ödemesi (marketplace):                     │
│  → Kullanılan MCP standardının creator'ına              │
│  → Kullanım başı mikro ödeme (kontrat ile)              │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ 8. SONUÇ TESLİMİ — Platform → Veri İsteyen              │
│                                                          │
│  MVP'de: OpenClaw encrypted payload üretir, platform     │
│  X402 doğrulaması sonrası buyer callbackUrl'e HTTPS ile  │
│  teslim eder (plaintext platforma girmez)               │
│  → Proof paketi + metadata                              │
│  → X402 ile "önce ödeme" garantisi                      │
│  → Hash + durum takibi blockchain'de                    │
│  → Bazı metadata IPFS'te                                │
│                                                          │
│  İleride: FHE ile özel aralık sorguları, veri talebi    │
│  seçenekleri genişleyecek                               │
└─────────────────────────────────────────────────────────┘
            ↓
┌─────────────────────────────────────────────────────────┐
│ 9. GERİ BİLDİRİM — Akıllı Kontrat ile                   │
│                                                          │
│  Marketplace MCP kalite değerlendirmesi:                │
│  → Başarılı proof oranı otomatik hesaplanır             │
│  → Kullanıcılar wallet+pseudoId ile oy verir            │
│  → Skor blockchain'de (şeffaf, manipülasyona dayanıklı) │
│  → Düşük skorlu MCP'ler uyarı alır                     │
│                                                          │
│  Veri kalitesi geri bildirimi:                          │
│  → İsteyen taraf proof'u değerlendirir                  │
│  → Dispute mekanizması (%10 havuz)                      │
└─────────────────────────────────────────────────────────┘
```

---

## Veri Türleri

### API Verisi (MVP)
- Web API'si olan her kaynak: Fitbit, Strava, Plaid, Spotify, GitHub, Google Fit, bank API'leri... ve daha fazlası simülasyon yapma
- zkTLS (Reclaim Protocol) ile kanıtlanır ekstra seçenek şuan kapalı
- Zaman damgalı — proof ne zaman üretildi kesin - veri isteyenin belirlediği tarih aralığı
- Doğrulama: ZK imza + timestamp + provider eşleşme

### Device/Cihaz Verisi (Phase 2)
- Cihazdan doğrudan alınan veri (sensör, GPS, kamera...) ekstra şuan kapalı
- Çalışma zamanı doğrulaması: gerçekten cihazda çalıştırıldı mı? (TEE, runtime attestation)
- ZK ile doğrulama mümkün ama TEE desteği gerekli
- İleride FHE ile spesifik aralık sorguları (ör: "yaşı 25-35 arası mı?" sorusuna evet/hayır, kesin yaş gizli)

---

## Veri Doğrulama Kontrolleri

| Kontrol | Ne Doğrulanır |
|---|---|
| **ZK imza** | Reclaim Protocol attestor imzası geçerli mi? |
| **Timestamp** | Proof üretim zamanı > consent TX zamanı mı? |
| **Provider eşleşme** | Proof'un kaynağı skill'in beklediği kaynak mı? |
| **Metric eşleşme** | İstenen metrikler proof'ta mevcut mu? |
| **Tekrar gönderim** | Aynı skill için aynı kullanıcı daha önce gönderdi mi? |
| **Consent kontrolü** | Stellar'da bu kullanıcı için ACCEPT TX var mı? |
| **Agent doğrulama** | Gerçekten OpenClaw ajanı şeffaf işlem mi yaptı? |

---

## Kimlik Gizleme

```
Stellar Public Key (G...56 chars)
        ↓ HMAC-SHA256(PSEUDONYM_SECRET)
  pseudo_id = "a7f3x9k2m1p8q4r5"  ← 16 karakter
  #PSEDUO ÜRETİLİRSE NASIL X402 ŞLE ÖDEME YAPILACAK??? WALLET İLE BAĞLANINCA TRANSACATİON YAPICAK ZTN!

Platform hiçbir zaman:
  
  ✗ Hangi OAuth hesabından veri çekildiğini bilmez
  ✗ Ham veriyi görmez

Platform şunu bilir:
  ✓ Bu pseudo_id bu skill için ACCEPT verdi (Stellar TX)-ÖDEME YAPAN -ALAN PUBLİC KEY ÖDEME TÜRÜNÜ MCPSEÇENKLERİSKİİLLER ...
  
  ✓ Proof gerçek bir web API'sinden üretildi (Reclaim)-PHASE 2
```

---

## Kullanıcı Giriş Akışı (Stellar Wallet)

```
Freighter Browser Extension
        ↓
GET /api/auth/challenge?address=G...
        ↓ 5 dakika geçerli nonce
Freighter.signMessage(challenge)
        ↓ Ed25519 imzası
POST /api/auth/verify { publicKey, signature, challenge }
        ↓ Keypair.verify() ile doğrulama
Session: { stellarAddress, pseudoId }
```

---

## Tech Stack Özeti

```
Frontend   : Next.js 16 + TypeScript + Tailwind CSS
Auth       : Stellar Freighter (Ed25519) + NextAuth v4
Backend    : Hono (Node.js) — port 3001
Ödeme      : X402 + Stellar + USDC (OpenZeppelin Relayer x402 Plugin)
Blockchain : Stellar + Soroban (escrow + geri bildirim kontratları)
ZK Proof   : Reclaim Protocol (zkFetch / zkTLS)
Storage    : Pinata IPFS (Skill JSON + MCP standartları)
Kimlik     : HMAC-SHA256 pseudo_id - ? WALLET ADRESİ İNDEX İÇİN BUNLAR OLAİBLİR?
Gateway    : OpenClaw (WhatsApp/Telegram/Discord) -AGNET.MD VERİ STANDARTLARI İÇİN KOMUT DİKKAT,VERİ AKTARIMI ŞİFRELİ FACİLATOR ARACILIĞLA!
WASM       : Kriptografik işlemler, ZK doğrulama client-side -PHASE 2
```

---

## Klasör Haritası

```
dataEconomy/
├── apps/
│   ├── web/                  Next.js — port 3000
│   │   └── src/
│   │       ├── app/(auth)/login     Freighter cüzdan girişi
│   │       ├── app/marketplace/     MCP marketplace (TODO)
│   │       ├── app/skills/          Skill oluşturma (TODO)
│   │       ├── app/tasks/           Görev listesi (TODO)
│   │       ├── app/dashboard/       Dashboard (TODO)
│   │       ├── hooks/useFreighter   Wallet bağlantı hook
│   │       └── components/ui/       Button vs
│   └── api/                  Hono — port 3001
│       └── src/routes/
│           ├── auth.ts        GET /challenge, POST /verify
│           ├── skills.ts      Skill oluşturma + IPFS upload
│           ├── proofs.ts      ZK proof doğrulama + escrow
│           └── consent.ts     OpenClaw bildirim + Stellar TX
├── packages/
│   ├── stellar/              Horizon SSE + consent TX
│   ├── reclaim/              zkFetch Fitbit/Strava proof
│   ├── ipfs/                 Pinata upload/download
│   └── pseudonym/            HMAC pseudo_id üretimi
├── contracts/
│   ├── escrow/               Soroban Rust (deposit/release/refund)
│   └── feedback/             MCP kalite değerlendirme kontratı (TODO)
├── .claude/agents/           Ajan tanımları
├── CLAUDE.md                 Geliştirici hafızası + kararlar
├── FLOW.md                   Bu dosya — işleyiş özeti
└── AGENT.md                  OpenClaw botu için direktifler (TODO)
```

---

## Eksik / Sonraki Adımlar

1. **Marketplace sayfası** — MCP listeleme, arama, filtreleme, upload, rating
2. **MCP oluşturucu** — Veri çekme standardı oluşturma formu-SİMÜLASYON YAPMA -mcp oluşturunca ipfs-ye dğaıtıpıp chainde mcp-id- adı -kime ait olduğu-dönnen volume-ipfs prompt-skill mcp standartı indexlenip tutulsun
3. **Veri sağlayıcı kayıt** — API/Device türü seçimi, OpenClaw bot ayarları-token giriş olasıllı policy seçimi!veri aktarrıırken son onay  kutusu!
4. **Görev listesi** — Bekleyen görevler + kabul/red + durum takibi-satır başı ödenen para
5. **Dashboard** — Kazançlar, aktif görevler, proof durumu(zaman damgası)
6. **Geri bildirim kontratı** — Soroban ile MCP kalite değerlendirmesi
7. **X402 middleware** — proofs/submit route'una bağla facilator aracı - buyer -facilator - seller(user +openclaw botu)
8. **Testnet deploy** — Soroban escrow Stellar testnet'e
9. **AGENT.md** — OpenClaw botu için direktifler
10. **Gerçek Stellar TX** — consent.ts'deki mock kaldır -simülasyon yapm
