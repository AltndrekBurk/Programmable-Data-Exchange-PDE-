"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { readUserProofs, type ChainEntry, type ProofData } from "@/lib/chain-reader";

export default function ProofsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [proofs, setProofs] = useState<ChainEntry<ProofData>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status !== "authenticated") return;

    const pseudoId = (session?.user as { pseudoId?: string })?.pseudoId;
    if (!pseudoId) return;

    // Read directly from Stellar Horizon + IPFS — no backend call
    readUserProofs(pseudoId)
      .then((data) => setProofs(data))
      .catch(() => setProofs([]))
      .finally(() => setLoading(false));
  }, [status, router, session]);

  const verified = proofs.filter((p) => p.data?.status === "verified").length;
  const failed = proofs.filter((p) => p.data?.status === "failed").length;
  const pending = proofs.filter((p) => p.data?.status === "pending").length;

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
          ZK-TLS proofs generated via Reclaim Protocol. Data read directly from Stellar + IPFS.
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
          <p className="text-slate-400">No proof records on-chain yet.</p>
          <p className="text-sm text-slate-500 mt-2">
            Proofs appear after a provider generates a ZK-TLS proof for a skill.
          </p>
        </div>
      ) : (
        <div className="flow-surface rounded-xl divide-y divide-slate-800">
          {proofs.map((proof) => (
            <div
              key={proof.key}
              className="flex items-center justify-between px-5 py-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm text-slate-200">
                    {(proof.data?.proofHash || proof.key).slice(0, 16)}...
                  </span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] border ${
                      proof.ipfsResolved
                        ? "border-emerald-500/30 text-emerald-300"
                        : "border-slate-600 text-slate-400"
                    }`}
                  >
                    {proof.ipfsResolved ? "IPFS" : "CID"}
                  </span>
                  <span className={`flow-status-badge ${proof.data?.status || "pending"}`}>
                    {proof.data?.status === "verified"
                      ? "Verified"
                      : proof.data?.status === "failed"
                        ? "Failed"
                        : "Pending"}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  {proof.data?.metric || "—"} — {proof.data?.timestamp?.split("T")[0] || "—"}
                </p>
              </div>
              <div className="text-xs text-slate-500 font-mono shrink-0 ml-4">
                {proof.data?.skillId ? `Skill: ${proof.data.skillId.slice(0, 8)}` : proof.cid.slice(0, 12)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
