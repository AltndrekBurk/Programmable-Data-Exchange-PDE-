"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface McpStandard {
  id: string;
  title: string;
  description: string;
  dataSource: string;
  metrics: string[];
  creator: string;
  usageCount: number;
  rating: number;
  ipfsHash: string;
}

export default function MarketplacePage() {
  const [standards, setStandards] = useState<McpStandard[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");

  useEffect(() => {
    apiFetch<{ standards: McpStandard[] }>("/api/marketplace")
      .then((data) => setStandards(data.standards || []))
      .catch(() => setStandards([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = standards.filter((s) => {
    const matchSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.description.toLowerCase().includes(search.toLowerCase());
    const matchSource =
      sourceFilter === "all" || s.dataSource === sourceFilter;
    return matchSearch && matchSource;
  });

  const sources = [...new Set(standards.map((s) => s.dataSource))];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketplace</h1>
          <p className="text-sm text-gray-500 mt-1">
            Topluluk tarafindan olusturulan veri cekme standartlari (MCP)
          </p>
        </div>
        <Link
          href="/marketplace/upload"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          MCP Yukle
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Ara..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          <option value="all">Tum Kaynaklar</option>
          {sources.map((src) => (
            <option key={src} value={src}>
              {src}
            </option>
          ))}
        </select>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="animate-pulse h-48 rounded-lg bg-gray-200"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-500">
            {standards.length === 0
              ? "Henuz MCP standardi yok. Ilkini sen yukle!"
              : "Aramanizla eslesen sonuc yok."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((standard) => (
            <div
              key={standard.id}
              className="rounded-lg border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                  {standard.dataSource}
                </span>
                <span className="text-xs text-gray-400">
                  {standard.usageCount} kullanim
                </span>
              </div>
              <h3 className="text-sm font-semibold text-gray-900 mb-1">
                {standard.title}
              </h3>
              <p className="text-xs text-gray-500 mb-3 line-clamp-2">
                {standard.description}
              </p>
              <div className="flex flex-wrap gap-1 mb-3">
                {standard.metrics.map((m) => (
                  <span
                    key={m}
                    className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
                  >
                    {m}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-mono">
                  {standard.creator.slice(0, 8)}...
                </span>
                <Link
                  href={`/skills/create?mcp=${standard.id}`}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  Kullan
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
