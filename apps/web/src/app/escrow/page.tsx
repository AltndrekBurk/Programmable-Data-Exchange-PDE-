"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface EscrowEntry {
  skillId: string;
  title: string;
  totalBudget: string;
  locked: string;
  released: string;
  status: "locked" | "releasing" | "released" | "disputed";
  createdAt: string;
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

    // TODO: Fetch from backend /api/escrow/list
    // For now, show empty state
    setLoading(false);
  }, [status, router]);

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
    switch (s) {
      case "locked":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-100 text-blue-700">Kilitli</span>;
      case "releasing":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">Serbest Birakilyor</span>;
      case "released":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Serbest</span>;
      case "disputed":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Itiraz</span>;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">Escrow Durumu</h1>
      <p className="text-sm text-gray-500 mb-6">
        Stellar Soroban escrow kontrati ile USDC kilitleme ve serbest birakma takibi
      </p>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 rounded-lg p-4">
          <p className="text-xs text-blue-500">Toplam Kilitli</p>
          <p className="text-xl font-bold text-blue-700">
            {escrows.reduce((sum, e) => sum + parseFloat(e.locked || "0"), 0).toFixed(2)} USDC
          </p>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <p className="text-xs text-green-500">Serbest Birakilan</p>
          <p className="text-xl font-bold text-green-700">
            {escrows.reduce((sum, e) => sum + parseFloat(e.released || "0"), 0).toFixed(2)} USDC
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <p className="text-xs text-gray-500">Aktif Escrow</p>
          <p className="text-xl font-bold text-gray-700">
            {escrows.filter((e) => e.status === "locked").length}
          </p>
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
          <p className="text-lg">Henuz escrow kaydı yok</p>
          <p className="text-sm mt-1">
            Bir skill olusturup USDC kilitldiginizde burada gorunur
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {escrows.map((entry) => (
            <div
              key={entry.skillId}
              className="border border-gray-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-800">{entry.title}</span>
                {statusBadge(entry.status)}
              </div>
              <div className="flex gap-6 text-sm text-gray-500">
                <span>Budget: {entry.totalBudget} USDC</span>
                <span>Kilitli: {entry.locked} USDC</span>
                <span>Serbest: {entry.released} USDC</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">
                {new Date(entry.createdAt).toLocaleString("tr-TR")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
