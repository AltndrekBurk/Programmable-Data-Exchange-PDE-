"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface Proof {
  proofHash: string;
  skillId: string;
  provider: string;
  metric: string;
  status: "verified" | "failed" | "pending";
  timestamp: string;
}

export default function ProofsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    fetch(`${apiUrl}/api/proofs/list`)
      .then((res) => res.json())
      .then((data) => setProofs(data.proofs || []))
      .catch(() => setProofs([]))
      .finally(() => setLoading(false));
  }, [status, router]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">ZK Proof Durumu</h1>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case "verified":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-700">Dogrulanmis</span>;
      case "failed":
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-700">Basarisiz</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">Bekliyor</span>;
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-2">ZK Proof Durumu</h1>
      <p className="text-sm text-gray-500 mb-6">
        Reclaim Protocol ile uretilen ZK-TLS kanit gecmisi
      </p>

      {proofs.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg">Henuz kanit yok</p>
          <p className="text-sm mt-1">Bir gorev kabul edip veri sagladiginizda burada gorunur</p>
        </div>
      ) : (
        <div className="space-y-3">
          {proofs.map((proof) => (
            <div
              key={proof.proofHash}
              className="border border-gray-200 rounded-lg p-4 flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-gray-700">
                    {proof.proofHash.slice(0, 12)}...
                  </span>
                  {statusBadge(proof.status)}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {proof.provider} / {proof.metric} — {new Date(proof.timestamp).toLocaleString("tr-TR")}
                </div>
              </div>
              <div className="text-xs text-gray-400 font-mono">
                Skill: {proof.skillId.slice(0, 8)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
