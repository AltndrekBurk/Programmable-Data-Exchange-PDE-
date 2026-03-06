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
