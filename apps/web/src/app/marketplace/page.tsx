"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchFromIpfs } from "@/lib/ipfs";
import { listEntityEntriesFromAccount } from "@/lib/stellar";

interface McpStandard {
  id: string;
  title: string;
  description: string;
  dataSource: string;
  metrics: string[];
  creator: string;
  usageCount: number;
  volume: number;
  proofType?: "zk-tls" | "attested-runtime" | "hybrid";
  freshnessSlaHours?: number;
  minWitnessCount?: number;
  deliveryFormat?: "json" | "cbor" | "protobuf";
  schemaVersion?: string;
  rating: number;
  ipfsHash: string;
}

export default function MarketplacePage() {
  const [standards, setStandards] = useState<McpStandard[]>([]);
  const [chainTotalVolume, setChainTotalVolume] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [proofFilter, setProofFilter] = useState("all");
  const [freshnessFilter, setFreshnessFilter] = useState("all");
  const [witnessFilter, setWitnessFilter] = useState("all");

  useEffect(() => {
    const platformAddress = process.env.NEXT_PUBLIC_STELLAR_PLATFORM_PUBLIC;
    if (!platformAddress) {
      setStandards([]);
      setChainTotalVolume(null);
      setLoading(false);
      return;
    }

    listEntityEntriesFromAccount(platformAddress, "mcp")
      .then(async (entries) => {
        const onChain = await Promise.all(
          entries.map(async (entry) => {
            try {
              const item = await fetchFromIpfs<Partial<McpStandard> & { id?: string }>(entry.ipfsHash);
              return {
                id: item.id || entry.id,
                title: item.title || "Untitled MCP",
                description: item.description || "",
                dataSource: item.dataSource || "unknown",
                metrics: item.metrics || [],
                creator: item.creator || "unknown",
                usageCount: item.usageCount || 0,
                volume: item.volume || 0,
                proofType: item.proofType || "zk-tls",
                freshnessSlaHours: item.freshnessSlaHours || 24,
                minWitnessCount: item.minWitnessCount || 1,
                deliveryFormat: item.deliveryFormat || "json",
                schemaVersion: item.schemaVersion || "1.0.0",
                rating: item.rating || 0,
                ipfsHash: entry.ipfsHash,
              } as McpStandard;
            } catch {
              return null;
            }
          })
        );

        const standards = onChain.filter((s): s is McpStandard => s !== null);
        setStandards(standards);
        setChainTotalVolume(standards.reduce((sum, s) => sum + (s.volume || 0), 0));
      })
      .catch(() => {
        setStandards([]);
        setChainTotalVolume(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = standards.filter((s) => {
    const matchSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchSource = sourceFilter === "all" || s.dataSource === sourceFilter;
    const matchProof = proofFilter === "all" || (s.proofType || "zk-tls") === proofFilter;
    const freshness = s.freshnessSlaHours ?? 24;
    const matchFreshness =
      freshnessFilter === "all" || freshness <= Number(freshnessFilter);
    const witnesses = s.minWitnessCount ?? 1;
    const matchWitness =
      witnessFilter === "all" || witnesses >= Number(witnessFilter);
    return matchSearch && matchSource && matchProof && matchFreshness && matchWitness;
  });

  const sources = [...new Set(standards.map((s) => s.dataSource))];
  const totalVolume =
    chainTotalVolume ?? standards.reduce((sum, item) => sum + (item.volume ?? 0), 0);
  const activePrograms = standards.filter((item) => item.usageCount > 0).length;
  const avgRating =
    standards.length > 0
      ? standards.reduce((sum, item) => sum + (item.rating ?? 0), 0) / standards.length
      : 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="flow-badge">Buy Data</span>
          <h1 className="mt-3 text-3xl font-bold text-slate-100">MCP Marketplace</h1>
          <p className="mt-2 text-sm text-slate-400">
            Compare MCP standards with real operational metadata: on-chain volume, proof type, witness threshold, and freshness SLA.
          </p>
        </div>
        <Link
          href="/marketplace/upload"
          className="inline-flex items-center justify-center rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
        >
          Publish Standard
        </Link>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Verified Volume</p>
          <p className="mt-1 text-2xl font-bold text-emerald-300">{totalVolume.toFixed(2)} USDC</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Active Programs</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{activePrograms}</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total Standards</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{standards.length}</p>
        </div>
        <div className="flow-surface rounded-lg px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Avg Rating</p>
          <p className="mt-1 text-2xl font-bold text-slate-100">{avgRating.toFixed(1)}</p>
        </div>
      </div>

      <div className="flow-surface mb-6 grid gap-3 rounded-xl p-4 md:grid-cols-2 lg:grid-cols-5">
        <input
          type="text"
          placeholder="Search standards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flow-input"
        />
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="flow-input">
          <option value="all">Source: All</option>
          {sources.map((src) => (
            <option key={src} value={src}>{src}</option>
          ))}
        </select>
        <select value={proofFilter} onChange={(e) => setProofFilter(e.target.value)} className="flow-input">
          <option value="all">Proof: All</option>
          <option value="zk-tls">zkTLS</option>
          <option value="attested-runtime">Attested Runtime</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <select value={freshnessFilter} onChange={(e) => setFreshnessFilter(e.target.value)} className="flow-input">
          <option value="all">Freshness SLA: All</option>
          <option value="24">≤ 24h</option>
          <option value="72">≤ 72h</option>
          <option value="168">≤ 7d</option>
        </select>
        <select value={witnessFilter} onChange={(e) => setWitnessFilter(e.target.value)} className="flow-input">
          <option value="all">Witness Min: All</option>
          <option value="1">≥ 1</option>
          <option value="2">≥ 2</option>
          <option value="3">≥ 3</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="animate-pulse h-52 rounded-lg bg-slate-900" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flow-surface rounded-xl py-16 text-center">
          <p className="text-slate-400">
            {standards.length === 0
              ? "No standards published yet. Be the first to publish one."
              : "No standards match your current filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((standard) => (
            <Link
              key={standard.id}
              href={`/marketplace/${standard.id}`}
              className="flow-surface block rounded-xl p-5 transition-all hover:-translate-y-0.5 hover:border-emerald-400/30"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full border border-cyan-400/40 bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-200">
                  {standard.dataSource}
                </span>
                <span className="text-xs text-slate-500">
                  {standard.usageCount} uses
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mb-1">
                {standard.title}
              </h3>
              <p className="text-xs text-slate-400 mb-3 line-clamp-2">
                {standard.description}
              </p>
              <div className="flex flex-wrap gap-1 mb-3">
                {standard.metrics.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center rounded border border-slate-700 bg-slate-900/50 px-1.5 py-0.5 text-xs text-slate-300"
                  >
                    {m}
                  </span>
                ))}
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-slate-700 bg-slate-900/40 px-2 py-1">
                  <p className="text-slate-500">Proof</p>
                  <p className="text-emerald-300">{standard.proofType || "zk-tls"}</p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-900/40 px-2 py-1">
                  <p className="text-slate-500">Volume</p>
                  <p className="text-emerald-300">{(standard.volume ?? 0).toFixed(2)} USDC</p>
                </div>
              </div>
              <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md border border-slate-700 bg-slate-900/40 px-2 py-1">
                  <p className="text-slate-500">Freshness SLA</p>
                  <p className="text-slate-200">{standard.freshnessSlaHours ?? 24}h</p>
                </div>
                <div className="rounded-md border border-slate-700 bg-slate-900/40 px-2 py-1">
                  <p className="text-slate-500">Witness Min</p>
                  <p className="text-slate-200">{standard.minWitnessCount ?? 1}</p>
                </div>
              </div>
              <p className="mb-4 text-[11px] text-slate-500">
                format: {standard.deliveryFormat || "json"} | schema: {standard.schemaVersion || "1.0.0"}
              </p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-mono">
                  {standard.creator.slice(0, 8)}...
                </span>
                <span
                  className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-200"
                >
                  View Details →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
