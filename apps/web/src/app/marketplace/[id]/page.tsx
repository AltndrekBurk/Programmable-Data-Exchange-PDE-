"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";
import { readMcpById } from "@/lib/chain-reader";
import { fetchFromIpfs } from "@/lib/ipfs";

interface McpDetail {
  id: string;
  title: string;
  description: string;
  dataSource: string;
  metrics: string[];
  creator: string;
  creatorAddress?: string;
  usageCount: number;
  volume: number;
  rating: number;
  ratingCount: number;
  ipfsHash: string;
  proofType: string;
  freshnessSlaHours: number;
  minWitnessCount: number;
  deliveryFormat: string;
  schemaVersion: string;
  dataRetentionDays: number;
  requiresConsentTx: boolean;
  apiEndpoint: string;
  authType: string;
  advancedConfig?: string;
  usageFee: number;
  createdAt: string;
}

interface Review {
  reviewer: string;
  rating: number;
  reason_cid: string;
  reasonText?: string;
  verified_by: string;
  ts: number;
}

export default function McpDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: session } = useSession();
  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  const [mcp, setMcp] = useState<McpDetail | null>(null);
  const [ipfsData, setIpfsData] = useState<Record<string, unknown> | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rating form
  const [ratingValue, setRatingValue] = useState(5);
  const [ratingReason, setRatingReason] = useState("");
  const [submittingRating, setSubmittingRating] = useState(false);

  /* Chain-first: read MCP detail from Stellar + IPFS */
  useEffect(() => {
    if (!id) return;

    (async () => {
      try {
        const entry = await readMcpById(id);
        if (!entry?.data) {
          setError("MCP not found on-chain");
          setLoading(false);
          return;
        }

        const mcpData = {
          ...entry.data,
          id: entry.data.id || id,
          ipfsHash: entry.cid,
        } as McpDetail;
        setMcp(mcpData);

        // Resolve full IPFS document
        if (entry.cid) {
          fetchFromIpfs<Record<string, unknown>>(entry.cid)
            .then(setIpfsData)
            .catch(() => setIpfsData(null));
        }

        // Reviews still come from backend (rating data may be off-chain)
        apiFetch<{ reviews: Review[] }>(`/api/marketplace/${id}/reviews`)
          .then((data) => setReviews(data.reviews || []))
          .catch(() => setReviews([]));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleRate = async () => {
    if (!stellarAddress) return;
    setSubmittingRating(true);
    try {
      await apiFetch(`/api/marketplace/${id}/rate`, {
        method: "POST",
        body: JSON.stringify({
          rating: ratingValue,
          reason: ratingReason,
          walletAddress: stellarAddress,
        }),
      });
      // Refresh
      const updated = await apiFetch<McpDetail>(`/api/marketplace/${id}`);
      setMcp(updated);
      const reviewData = await apiFetch<{ reviews: Review[] }>(`/api/marketplace/${id}/reviews`).catch(() => ({ reviews: [] }));
      setReviews(reviewData.reviews || []);
      setRatingReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rating failed");
    } finally {
      setSubmittingRating(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-slate-800" />
          <div className="h-4 w-2/3 rounded bg-slate-800" />
          <div className="h-64 rounded-xl bg-slate-800" />
        </div>
      </div>
    );
  }

  if (error || !mcp) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-10">
        <div className="flow-error">{error || "MCP not found"}</div>
        <Link href="/marketplace" className="mt-4 inline-block text-sm text-emerald-400 hover:underline">
          Back to Marketplace
        </Link>
      </div>
    );
  }

  const stars = (n: number) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <Link href="/marketplace" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-emerald-300">
        ← Marketplace
      </Link>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <span className="inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2.5 py-0.5 text-xs font-medium text-cyan-200">
            {mcp.dataSource}
          </span>
          <span className="inline-flex items-center rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-200">
            {mcp.proofType}
          </span>
        </div>
        <h1 className="text-2xl font-bold text-slate-100">{mcp.title}</h1>
        <p className="mt-2 text-sm text-slate-400">{mcp.description}</p>
      </div>

      {/* Stats Grid */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Volume</p>
          <p className="mt-1 text-lg font-bold text-emerald-300">{mcp.volume.toFixed(2)} USDC</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Uses</p>
          <p className="mt-1 text-lg font-bold text-slate-100">{mcp.usageCount}</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Rating</p>
          <p className="mt-1 text-lg font-bold text-amber-300">
            {mcp.rating > 0 ? `${mcp.rating.toFixed(1)} ${stars(mcp.rating)}` : "No ratings"}
          </p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Fee</p>
          <p className="mt-1 text-lg font-bold text-slate-100">{mcp.usageFee} USDC</p>
        </div>
      </div>

      {/* Technical Details */}
      <div className="flow-surface mb-6 rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-300">Technical Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-slate-500">Auth Type</p>
            <p className="text-slate-200">{mcp.authType}</p>
          </div>
          <div>
            <p className="text-slate-500">Delivery Format</p>
            <p className="text-slate-200">{mcp.deliveryFormat}</p>
          </div>
          <div>
            <p className="text-slate-500">Schema Version</p>
            <p className="text-slate-200">{mcp.schemaVersion}</p>
          </div>
          <div>
            <p className="text-slate-500">Freshness SLA</p>
            <p className="text-slate-200">{mcp.freshnessSlaHours}h</p>
          </div>
          <div>
            <p className="text-slate-500">Min Witnesses</p>
            <p className="text-slate-200">{mcp.minWitnessCount}</p>
          </div>
          <div>
            <p className="text-slate-500">Data Retention</p>
            <p className="text-slate-200">{mcp.dataRetentionDays} days</p>
          </div>
          <div>
            <p className="text-slate-500">Consent TX Required</p>
            <p className="text-slate-200">{mcp.requiresConsentTx ? "Yes" : "No"}</p>
          </div>
          <div>
            <p className="text-slate-500">Creator</p>
            <p className="text-slate-200 font-mono text-xs">
              {mcp.creatorAddress ? `${mcp.creatorAddress.slice(0, 8)}...${mcp.creatorAddress.slice(-4)}` : mcp.creator}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Created</p>
            <p className="text-slate-200">{new Date(mcp.createdAt).toLocaleDateString()}</p>
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-4">
          <p className="mb-2 text-slate-500 text-sm">Metrics</p>
          <div className="flex flex-wrap gap-1.5">
            {mcp.metrics.map((m) => (
              <span key={m} className="inline-flex items-center rounded border border-slate-700 bg-slate-900/50 px-2 py-0.5 text-xs text-slate-300">
                {m}
              </span>
            ))}
          </div>
        </div>

        {/* API Endpoint */}
        <div className="mt-4">
          <p className="mb-1 text-slate-500 text-sm">API Endpoint</p>
          <code className="block rounded bg-slate-900 px-3 py-2 text-xs text-emerald-300 font-mono break-all">
            {mcp.apiEndpoint}
          </code>
        </div>

        {mcp.advancedConfig && (
          <div className="mt-4">
            <p className="mb-1 text-slate-500 text-sm">Advanced Config</p>
            <pre className="rounded bg-slate-900 px-3 py-2 text-xs text-slate-300 overflow-x-auto">
              {mcp.advancedConfig}
            </pre>
          </div>
        )}
      </div>

      {/* IPFS Data */}
      <div className="flow-surface mb-6 rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-300">IPFS Storage</h2>
        {mcp.ipfsHash ? (
          <>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-xs text-slate-500">CID:</span>
              <code className="text-xs text-emerald-300 font-mono">{mcp.ipfsHash}</code>
              <a
                href={`https://gateway.pinata.cloud/ipfs/${mcp.ipfsHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-cyan-400 hover:underline"
              >
                View on IPFS →
              </a>
            </div>
            {ipfsData && (
              <pre className="max-h-48 overflow-auto rounded bg-slate-900 px-3 py-2 text-xs text-slate-300">
                {JSON.stringify(ipfsData, null, 2)}
              </pre>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">No IPFS hash available</p>
        )}
      </div>

      {/* Reviews */}
      <div className="flow-surface mb-6 rounded-xl p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-300">
          Reviews ({reviews.length})
        </h2>

        {reviews.length === 0 ? (
          <p className="text-sm text-slate-500">No reviews yet. Be the first to rate this standard.</p>
        ) : (
          <div className="space-y-3">
            {reviews.map((r, i) => (
              <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-amber-300 text-sm">{stars(r.rating)}</span>
                  <span className="text-xs text-slate-500 font-mono">
                    {r.reviewer.slice(0, 8)}...
                  </span>
                </div>
                {r.reasonText && (
                  <p className="text-sm text-slate-300">{r.reasonText}</p>
                )}
                {r.reason_cid && (
                  <a
                    href={`https://gateway.pinata.cloud/ipfs/${r.reason_cid}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-cyan-400 hover:underline"
                  >
                    Reason IPFS: {r.reason_cid.slice(0, 16)}...
                  </a>
                )}
                <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                  <span>Verified by: {r.verified_by.slice(0, 8)}...</span>
                  <span>{new Date(r.ts * 1000).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Rating Form */}
        {stellarAddress && (
          <div className="mt-4 border-t border-slate-800 pt-4">
            <h3 className="mb-2 text-sm font-medium text-slate-200">Submit Rating</h3>
            <div className="flex items-center gap-3 mb-2">
              <label className="text-xs text-slate-400">Score:</label>
              <select
                value={ratingValue}
                onChange={(e) => setRatingValue(Number(e.target.value))}
                className="flow-input w-20"
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>{v} {stars(v)}</option>
                ))}
              </select>
            </div>
            <textarea
              value={ratingReason}
              onChange={(e) => setRatingReason(e.target.value)}
              placeholder="Why this rating? (stored on IPFS)"
              rows={2}
              className="flow-input mb-2 w-full"
            />
            <Button onClick={handleRate} isLoading={submittingRating} className="w-full sm:w-auto">
              Submit Rating
            </Button>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Link
          href={`/buy?mcp=${mcp.id}`}
          className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/15 py-3 text-center text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
        >
          Use in Buy Data
        </Link>
        <Link
          href="/marketplace"
          className="rounded-lg border border-slate-700 bg-slate-800/50 px-6 py-3 text-sm text-slate-300 hover:bg-slate-700/50 transition-colors"
        >
          Back
        </Link>
      </div>
    </div>
  );
}
