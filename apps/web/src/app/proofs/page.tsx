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

  const verified = proofs.filter((p) => p.status === "verified").length;
  const failed = proofs.filter((p) => p.status === "failed").length;
  const pending = proofs.filter((p) => p.status === "pending").length;

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-900" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-900" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-lg bg-slate-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      <div>
        <span className="flow-badge">Proof Ledger</span>
        <h1 className="mt-3 text-3xl font-bold text-slate-100">ZK Proof History</h1>
        <p className="mt-2 text-sm text-slate-400">
          ZK-TLS proofs generated via Reclaim Protocol. Each proof cryptographically verifies data origin.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Verified</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{verified}</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Pending</p>
          <p className="mt-1 text-2xl font-bold text-amber-300">{pending}</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Failed</p>
          <p className="mt-1 text-2xl font-bold text-red-300">{failed}</p>
        </div>
      </div>

      {proofs.length === 0 ? (
        <div className="flow-surface rounded-xl py-16 text-center">
          <p className="text-slate-400">No proofs recorded yet.</p>
          <p className="text-sm text-slate-500 mt-2">
            Proofs appear here after a provider submits verified data for a flow task.
          </p>
        </div>
      ) : (
        <div className="flow-surface rounded-xl divide-y divide-slate-800">
          {proofs.map((proof) => (
            <div
              key={proof.proofHash}
              className="flex items-center justify-between px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-slate-200">
                    {proof.proofHash.slice(0, 16)}...
                  </span>
                  <span className={`flow-status-badge ${proof.status}`}>
                    {proof.status === "verified" ? "Verified" : proof.status === "failed" ? "Failed" : "Pending"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {proof.provider} / {proof.metric} — {new Date(proof.timestamp).toLocaleString("en-US")}
                </p>
              </div>
              <div className="text-xs text-slate-500 font-mono shrink-0 ml-4">
                Skill: {proof.skillId.slice(0, 8)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
