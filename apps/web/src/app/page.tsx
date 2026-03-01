import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-20">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          dataEconomy
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          Gizlilik korumalı veri ekonomisi platformu. Ham veri kimseye
          görünmez — sadece kriptografik kanıt akar. Ödeme Stellar üzerinden
          otomatik.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/skills/create"
            className="rounded-md bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 transition-colors"
          >
            Veri Talep Et
          </Link>
          <Link
            href="/marketplace"
            className="rounded-md bg-white px-6 py-3 text-sm font-semibold text-gray-900 shadow ring-1 ring-inset ring-gray-300 hover:bg-gray-50 transition-colors"
          >
            Marketplace
          </Link>
        </div>
      </div>

      <div className="mt-20 grid grid-cols-1 gap-8 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            ZK-TLS Kanıt
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Reclaim Protocol ile veri kaynağından gelen bilginin gerçekliği
            kanıtlanır. Ham veri hiçbir zaman görünmez.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            Stellar Escrow
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Soroban akıllı kontratı ile USDC kilitleme ve 3-yönlü atomik
            ödeme. Sağlayıcı %70, platform %20, dispute %10.
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900">
            MCP Marketplace
          </h3>
          <p className="mt-2 text-sm text-gray-600">
            Topluluk tarafından oluşturulan veri çekme standartları. Creator'lar
            kullanım başı kazanç elde eder.
          </p>
        </div>
      </div>
    </div>
  );
}
