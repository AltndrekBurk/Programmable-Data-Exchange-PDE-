# dataEconomy — FLOW
Son güncelleme: 2026-03-06 (v1.2)

## 1) Sistem Rolleri

- **Buyer (Veri İsteyen):** Skill oluşturur veya marketplace MCP kullanır, escrow lock başlatır.
- **Seller (Veri Sağlayıcı):** Görevi kabul eder, OpenClaw ile veri çeker/proof üretir.
- **MCP Creator:** MCP standardı üretir, kullanıldıkça creator payı alır.
- **Facilitator (Platform API):** Ham veriye dokunmadan policy, ödeme doğrulama ve teslimi orkestre eder.
- **Stellar/Soroban:** Index + consent + escrow state + ödeme dağıtımı.
- **IPFS (Pinata):** Skill/MCP/policy payload depolama.

## 2) Uçtan Uca Ana Akış

1. Buyer frontend'de skill/policy doldurur.
2. Frontend payload'ı Pinata HTTPS API ile IPFS'e yükler, CID alır.
3. Frontend Freighter ile CID index bilgisini Stellar'a yazar.
4. Frontend backend'e sadece `notify` ile `txHash/cid/address` bildirir.
5. Seller UI/OpenClaw görevleri API'den alır; API yoksa chain+IPFS fallback ile okur.
6. Seller kabul ettiğinde consent zincire yazılır.
7. Buyer escrow lock işlemini kontrat üzerinden başlatır.
8. OpenClaw veri toplar, proof üretir, şifreli payload hazırlar.
9. `/api/proofs/submit` `x402` middleware doğrulamasından geçer.
10. Facilitator proof/policy kontrollerini yapar, buyer callback'ine `encryptedPayload` forward eder.
11. Escrow release kontrat çağrısıyla yapılır; gerekiyorsa MCP creator split kontrat içinde dağıtılır.

## 3) Şifreli Teslim Modeli

- Skill metadata içinde `deliveryPublicKey` tutulur.
- OpenClaw payload'ı buyer public key ile şifreler.
- Facilitator sadece `encryptedPayload` + checksum taşır.
- Buyer callback servisinde private key ile çözüm yapılır.
- Integrity kontrolü: `checksum` + `proofHash`.

## 4) Ödeme ve Dağıtım

- Spam/abuse önleme: `x402` ödeme başlığı doğrulaması.
- Escrow release: provider/platform/dispute payları kontratta atomik dağıtılır.
- MCP kullanılan işlerde creator payı da `release_with_mcp_fee` akışında kontrat seviyesinde dağılır.

## 5) Durum Özeti (MVP)

### Tamamlanan
- Frontend direct IPFS upload ve direct chain indexleme.
- Backend facilitator-awareness `notify` modeli.
- Proof submit için x402 middleware.
- Escrow kontratında MCP creator split desteği.
- Delivery key metadata taşıma ve encrypted relay pipeline.

### Devam Eden / Phase 2
- Tam production-grade on-chain event stream otomasyonu (özellikle bot orchestration tarafında genişletme).
- ZK-TLS attestor altyapısının tamamen gerçek üretim pipeline'ına taşınması.
- Dispute/FHE tabanlı ileri hakemlik modeli.
