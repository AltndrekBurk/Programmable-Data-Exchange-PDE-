"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
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

export default function CreateSkillPage() {
  return (
    <Suspense fallback={null}>
      <CreateSkillInner />
    </Suspense>
  );
}

function CreateSkillInner() {
  const { status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const mcpId = searchParams.get("mcp");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    skillId: string;
    ipfsHash: string;
    escrowAddress: string;
  } | null>(null);

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
      durationDays: Number(form.get("durationDays")),
      rewardPerUser: Number(form.get("rewardPerUser")),
      totalBudget: Number(form.get("totalBudget")),
      targetCount: Number(form.get("targetCount")),
      callbackUrl: (form.get("callbackUrl") as string) || undefined,
      mcpId: mcpId || undefined,
    };

    try {
      const res = await apiFetch<{
        skillId: string;
        ipfsHash: string;
        escrowAddress: string;
      }>("/api/skills", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bir hata olustu");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return null;

  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="rounded-lg border border-green-200 bg-green-50 p-6">
          <h2 className="text-lg font-semibold text-green-900 mb-4">
            Veri Talebi Olusturuldu
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-green-700 font-medium">Skill ID</dt>
              <dd className="font-mono text-green-900">{result.skillId}</dd>
            </div>
            <div>
              <dt className="text-green-700 font-medium">IPFS Hash</dt>
              <dd className="font-mono text-green-900">{result.ipfsHash}</dd>
            </div>
            <div>
              <dt className="text-green-700 font-medium">Escrow Adresi</dt>
              <dd className="font-mono text-green-900 break-all">
                {result.escrowAddress}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-green-700">
            USDC'yi escrow adresine yatirarak talebi aktif edebilirsin.
          </p>
          <div className="mt-6 flex gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push("/dashboard")}
            >
              Dashboard'a Don
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
            >
              Yeni Talep Olustur
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Veri Talep Et
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {mcpId
          ? `Marketplace MCP #${mcpId.slice(0, 8)} kullaniliyor. Parametreleri ozellestir.`
          : "Ne tur veri istedigini tanimla. Uygun saglayicilar bilgilendirilecek."}
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
            placeholder="Fitbit 90 Gunluk Adim Verisi"
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
            placeholder="Hangi verileri neden istedigini acikla..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
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
              Sure (gun)
            </label>
            <input
              name="durationDays"
              type="number"
              required
              min={1}
              max={365}
              defaultValue={30}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
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

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Kullanici Basi Odul (USDC)
            </label>
            <input
              name="rewardPerUser"
              type="number"
              required
              min={0.01}
              step={0.01}
              defaultValue={1.5}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Toplam Butce (USDC)
            </label>
            <input
              name="totalBudget"
              type="number"
              required
              min={1}
              step={0.01}
              defaultValue={150}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Hedef Kullanici
            </label>
            <input
              name="targetCount"
              type="number"
              required
              min={1}
              defaultValue={100}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Callback URL (opsiyonel)
          </label>
          <input
            name="callbackUrl"
            type="url"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="https://sirketim.com/webhook/data-ready"
          />
        </div>

        <Button type="submit" isLoading={submitting} className="w-full">
          Talep Olustur ve IPFS'e Yukle
        </Button>
      </form>
    </div>
  );
}
