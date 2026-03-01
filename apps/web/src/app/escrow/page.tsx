"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface EscrowEntry {
  id: string;
  skillId: string;
  title: string;
  totalBudget: string;
  locked: string;
  released: string;
  providerShare: string;
  platformShare: string;
  disputePool: string;
  status: "locked" | "releasing" | "released" | "disputed" | "refunded";
  createdAt: string;
  txHash?: string;
}

export default function EscrowPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [escrows, setEscrows] = useState<EscrowEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    const address = session?.user?.stellarAddress;
    const query = address ? `?address=${address}` : "";

    apiFetch<{ escrows: EscrowEntry[] }>(`/api/escrow/list${query}`)
      .then((data) => setEscrows(data.escrows || []))
      .catch(() => setEscrows([]))
      .finally(() => setLoading(false));
  }, [status, router, session]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Escrow Durumu</h1>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const statusBadge = (s: string) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      locked: { bg: "bg-blue-100", text: "text-blue-700", label: "Kilitli" },
      releasing: { bg: "bg-yellow-100", text: "text-yellow-700", label: "Serbest Birakiliyor" },
      released: { bg: "bg-green-100", text: "text-green-700", label: "Serbest" },
      disputed: { bg: "bg-red-100", text: "text-red-700", label: "Itiraz" },
      refunded: { bg: "bg-gray-100", text: "text-gray-700", label: "Iade" },
    };
    const style = styles[s] || styles.locked;
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${style.bg} ${style.text}`}>
        {style.label}
      </span>
    );
  };

  const totalLocked = escrows.reduce((sum, e) => sum + parseFloat(e.locked || "0"), 0);
  const totalReleased = escrows.reduce((sum, e) => sum + parseFloat(e.released || "0"), 0);
  const totalBudget = escrows.reduce((sum, e) => sum + parseFloat(e.totalBudget || "0"), 0);
  const activeCount = escrows.filter((e) => e.status === "locked").length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Escrow Durumu</h1>
      <p className="text-sm text-gray-500 mb-6">
        Stellar Soroban escrow kontrati ile USDC kilitleme ve serbest birakma takibi
      </p>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">Toplam Butce</p>
          <p className="text-xl font-bold text-gray-700">{totalBudget.toFixed(2)} USDC</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-xs text-blue-500">Kilitli</p>
          <p className="text-xl font-bold text-blue-700">{totalLocked.toFixed(2)} USDC</p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-xs text-green-500">Serbest Birakilan</p>
          <p className="text-xl font-bold text-green-700">{totalReleased.toFixed(2)} USDC</p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">Aktif Escrow</p>
          <p className="text-xl font-bold text-gray-700">{activeCount}</p>
        </div>
      </div>

      {/* Escrow Split Info */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-sm text-gray-600">
        <p className="font-medium text-gray-700 mb-1">Escrow Dagitim Orani (Atomik)</p>
        <div className="flex gap-4">
          <span>%70 Saglayici</span>
          <span>%20 Platform</span>
          <span>%10 Dispute Pool</span>
        </div>
      </div>

      {escrows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Henuz escrow kaydi yok</p>
          <p className="text-sm mt-1">
            Bir skill olusturup USDC kilitldiginizde burada gorunur
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {escrows.map((entry) => (
            <div
              key={entry.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-800">{entry.title}</span>
                {statusBadge(entry.status)}
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                <span>Butce: {entry.totalBudget} USDC</span>
                <span>Kilitli: {entry.locked} USDC</span>
                <span>Serbest: {entry.released} USDC</span>
              </div>
              {entry.status === "released" && (
                <div className="flex gap-4 text-xs text-gray-400 mt-1">
                  <span>Saglayici: {entry.providerShare} USDC</span>
                  <span>Platform: {entry.platformShare} USDC</span>
                  <span>Dispute: {entry.disputePool} USDC</span>
                </div>
              )}
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">
                  {new Date(entry.createdAt).toLocaleString("tr-TR")}
                </span>
                {entry.txHash && (
                  <span className="text-xs text-gray-400 font-mono">
                    TX: {entry.txHash.slice(0, 16)}...
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
