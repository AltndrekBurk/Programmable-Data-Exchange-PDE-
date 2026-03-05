"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";

const PROOF_TYPES = [
  { id: "zk-tls", label: "zkTLS (API proof)" },
  { id: "attested-runtime", label: "Attested Runtime" },
  { id: "hybrid", label: "Hybrid" },
];

const DELIVERY_FORMATS = [
  { id: "json", label: "JSON" },
  { id: "cbor", label: "CBOR" },
  { id: "protobuf", label: "Protobuf" },
];

export default function UploadMcpPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const metricsRaw = form.get("metrics") as string;

    const body = {
      title: form.get("title") as string,
      description: form.get("description") as string,
      dataSource: (form.get("dataSource") as string) || "custom",
      metrics: metricsRaw.split(",").map((m) => m.trim()).filter(Boolean),
      apiEndpoint: form.get("apiEndpoint") as string,
      authType: form.get("authType") as string,
      responseFormat: form.get("responseFormat") as string,
      usageFee: Number(form.get("usageFee")) || 0.05,
      proofType: form.get("proofType") as string,
      freshnessSlaHours: Number(form.get("freshnessSlaHours")) || 24,
      minWitnessCount: Number(form.get("minWitnessCount")) || 1,
      deliveryFormat: form.get("deliveryFormat") as string,
      schemaVersion: (form.get("schemaVersion") as string) || "1.0.0",
      dataRetentionDays: Number(form.get("dataRetentionDays")) || 30,
      requiresConsentTx: form.get("requiresConsentTx") === "on",
      advancedConfig: (form.get("advancedConfig") as string) || "",
      creatorAddress: stellarAddress || undefined,
    };

    try {
      await apiFetch("/api/marketplace", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push("/marketplace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <span className="flow-badge">Creator Console</span>
      <h1 className="mt-3 text-3xl font-bold text-slate-100">
        Publish MCP Standard
      </h1>
      <p className="mt-2 mb-8 text-sm text-slate-400">
        Publish a reusable MCP standard for Buy Data programs. Include verification and delivery requirements that can be enforced at runtime.
      </p>

      {error && <div className="flow-error mb-6">{error}</div>}

      <form onSubmit={handleSubmit} className="flow-surface space-y-6 rounded-xl p-6">
        <div>
          <label className="flow-label">Standard Title</label>
          <input
            name="title"
            required
            className="flow-input"
            placeholder="e.g. Daily Activity Summary"
          />
        </div>

        <div>
          <label className="flow-label">Description</label>
          <textarea
            name="description"
            required
            rows={3}
            className="flow-input"
            placeholder="What data this standard extracts and how it works..."
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="flow-label">Data Source (serbest metin)</label>
            <input
              name="dataSource"
              required
              className="flow-input"
              placeholder="ör. health-api, bank-api-xyz, custom-backend"
            />
          </div>
          <div>
            <label className="flow-label">Auth Type</label>
            <select name="authType" required className="flow-input">
              <option value="oauth2">OAuth 2.0</option>
              <option value="api_key">API Key</option>
              <option value="bearer">Bearer Token</option>
              <option value="none">None (Public API)</option>
            </select>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Advanced MCP Settings
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="flow-label">Proof Type</label>
              <select name="proofType" defaultValue="zk-tls" className="flow-input">
                {PROOF_TYPES.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flow-label">Freshness SLA (hours)</label>
              <input
                name="freshnessSlaHours"
                type="number"
                min={1}
                max={168}
                defaultValue={24}
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label">Minimum Witness Count</label>
              <input
                name="minWitnessCount"
                type="number"
                min={1}
                max={10}
                defaultValue={1}
                className="flow-input"
              />
            </div>
            <div>
              <label className="flow-label">Delivery Format</label>
              <select name="deliveryFormat" defaultValue="json" className="flow-input">
                {DELIVERY_FORMATS.map((d) => (
                  <option key={d.id} value={d.id}>{d.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flow-label">Schema Version</label>
              <input
                name="schemaVersion"
                defaultValue="1.0.0"
                className="flow-input"
                placeholder="1.0.0"
              />
            </div>
            <div>
              <label className="flow-label">Data Retention (days)</label>
              <input
                name="dataRetentionDays"
                type="number"
                min={1}
                max={365}
                defaultValue={30}
                className="flow-input"
              />
            </div>
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              name="requiresConsentTx"
              defaultChecked
              className="h-4 w-4 rounded border-slate-700 bg-slate-900"
            />
            Require explicit on-chain consent transaction
          </label>
        </div>

        <div className="border-t border-slate-800 pt-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-emerald-300">
            Advanced MCP Config (string)
          </h2>
          <p className="mb-2 text-xs text-slate-500">
            Belirli siteler / API&apos;ler için özel araştırma tipleri, ek kurallar, özel JSON şemaları vb. Her şey serbest metin/string olarak saklanır.
          </p>
          <textarea
            name="advancedConfig"
            rows={4}
            className="flow-input"
            placeholder='Örnek: {"site":"example.com","query":"özel arama tipi","notes":"..."} veya tamamen açıklama metni.'
          />
        </div>

        <div>
          <label className="flow-label">Metrics (comma-separated)</label>
          <input
            name="metrics"
            required
            className="flow-input"
            placeholder="metricA, metricB, metricC"
          />
        </div>

        <div>
          <label className="flow-label">API Endpoint</label>
          <input
            name="apiEndpoint"
            required
            className="flow-input"
            placeholder="https://api.your-source.com/v1/data"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="flow-label">Response Format (JSON path)</label>
            <input
              name="responseFormat"
              className="flow-input"
              placeholder='$.summary.steps or $.data[0].value'
            />
          </div>
          <div>
            <label className="flow-label">Usage Fee (USDC per use)</label>
            <input
              name="usageFee"
              type="number"
              min={0}
              max={10}
              step={0.01}
              defaultValue={0.05}
              className="flow-input"
            />
          </div>
        </div>

        <Button type="submit" isLoading={submitting} className="w-full">
          Publish Standard
        </Button>
      </form>
    </div>
  );
}
