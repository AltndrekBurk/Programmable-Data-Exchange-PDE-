"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";

const DATA_SOURCES = [
  "fitbit",
  "strava",
  "plaid",
  "spotify",
  "github",
  "google_fit",
  "oura",
  "withings",
  "garmin",
  "custom",
];

export default function UploadMcpPage() {
  const { status } = useSession();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      dataSource: form.get("dataSource") as string,
      metrics: metricsRaw.split(",").map((m) => m.trim()).filter(Boolean),
      apiEndpoint: form.get("apiEndpoint") as string,
      authType: form.get("authType") as string,
      responseFormat: form.get("responseFormat") as string,
    };

    try {
      await apiFetch("/api/marketplace", {
        method: "POST",
        body: JSON.stringify(body),
      });
      router.push("/marketplace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        MCP Standardi Yukle
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        Veri cekme standardi olusturup marketplace'e yukle. Birisi
        standardini kullanirsa kullanim basi kazanc elde edersin.
      </p>

      {error && (
        <div className="mb-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Baslik
          </label>
          <input
            name="title"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Ornek: Fitbit Gunluk Adim Verisi"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Aciklama
          </label>
          <textarea
            name="description"
            required
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Bu MCP ne yapar, hangi verileri ceker..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Veri Kaynagi
          </label>
          <select
            name="dataSource"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            {DATA_SOURCES.map((src) => (
              <option key={src} value={src}>
                {src}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Metrikler (virgülle ayir)
          </label>
          <input
            name="metrics"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="steps, heart_rate, calories"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Endpoint
          </label>
          <input
            name="apiEndpoint"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="https://api.fitbit.com/1/user/-/activities/date/today.json"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Auth Tipi
          </label>
          <select
            name="authType"
            required
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="oauth2">OAuth 2.0</option>
            <option value="api_key">API Key</option>
            <option value="bearer">Bearer Token</option>
            <option value="none">Yok (Public API)</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Beklenen Yanit Formati (JSON path)
          </label>
          <input
            name="responseFormat"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder='$.summary.steps veya $.activities-heart[0].value'
          />
        </div>

        <Button type="submit" isLoading={submitting} className="w-full">
          Marketplace'e Yukle
        </Button>
      </form>
    </div>
  );
}
