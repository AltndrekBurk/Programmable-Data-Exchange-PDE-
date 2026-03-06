"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { uploadJsonToIpfs } from "@/lib/ipfs";
import { buildManageDataTx, signAndSubmitTx } from "@/lib/stellar";

export default function ProviderRegistrationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [capabilities, setCapabilities] = useState("");
  const [openclawUrl, setOpenclawUrl] = useState("");
  const [openclawToken, setOpenclawToken] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "telegram" | "discord">("whatsapp");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-1/3 rounded bg-slate-900" />
          <div className="h-4 w-2/3 rounded bg-slate-900" />
          <div className="h-40 rounded-lg bg-slate-900" />
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!capabilities.trim()) {
      setError("Lütfen sağlayabildiğin veri türlerini ve kaynaklarını açıklama alanına yaz.");
      return;
    }
    if (!openclawUrl) {
      setError("OpenClaw URL is required");
      return;
    }

    const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;
    if (!stellarAddress) {
      setError("Freighter wallet bağlantısı bulunamadı");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // 1) Frontend -> Pinata HTTPS API
      const providerData = {
        stellarAddress,
        dataSources: ["custom"],
        supportedDataDescription: capabilities,
        openclawUrl,
        channel,
        contactInfo: openclawToken || "pending",
        policy: { capabilities },
        registeredAt: new Date().toISOString(),
      };

      const ipfsHash = await uploadJsonToIpfs(providerData, {
        name: `provider-${stellarAddress.slice(0, 8)}.json`,
        keyvalues: { type: "provider" },
      });

      // 2) Frontend -> Stellar (Freighter signed)
      const indexKey = `pr:${stellarAddress.slice(0, 24)}`;
      const xdr = await buildManageDataTx(stellarAddress, indexKey, ipfsHash);
      const txHash = await signAndSubmitTx(xdr);

      // 3) Backend notify only
      await apiFetch("/api/notify/provider", {
        method: "POST",
        body: JSON.stringify({
          stellarAddress,
          ipfsHash,
          txHash,
          dataSources: ["custom"],
          supportedDataDescription: capabilities,
          openclawUrl,
          channel,
          contactInfo: openclawToken || "pending",
          policy: { capabilities },
        }),
      }).catch((err) => console.warn("[provider] notify failed:", err));

      // still backend-only sensitive bot token persistence
      if (openclawToken) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        await fetch(`${apiUrl}/api/provider/bot-config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ stellarAddress, openclawUrl, openclawToken }),
        }).catch(() => {});
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flow-surface rounded-xl p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15">
            <svg className="h-6 w-6 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-100 mb-2">Registration Complete</h2>
          <p className="text-sm text-slate-400 mb-6">
            You are now registered as a data provider. Buy Data requests will appear in your Sell Data dashboard.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push("/sell")} variant="primary">Provider Console</Button>
            <Button onClick={() => router.push("/dashboard")} variant="outline">Dashboard</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <span className="flow-badge">Provider Onboarding</span>
      <h1 className="mt-3 text-3xl font-bold text-slate-100">Register as Provider</h1>
      <p className="mt-2 mb-8 text-sm text-slate-400">
        Açıklamayı frontend&apos;den doğrudan IPFS&apos;e yükleyip Freighter ile zincire yazarsın; backend sadece TX hash ile haberdar edilir.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flow-surface rounded-xl p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300 mb-3">
              Sağlayabildiğin veri ve kaynaklar
            </h3>
            <p className="text-xs text-slate-500 mb-2">
              Örnek: Fitbit günlük adım, Strava koşu aktiviteleri, belirli banka API&apos;leri, sadece 2024 sonrası veri.
            </p>
            <textarea
              className="flow-input min-h-[140px]"
              value={capabilities}
              onChange={(e) => setCapabilities(e.target.value)}
              placeholder="Sağlayabildiğin API ve cihaz veri tiplerini, hangi hesaplardan/cihazlardan çektiğini ve sınırlarını ayrıntılı yaz."
              required
            />
          </div>
        </div>

        <div className="flow-surface rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-300">OpenClaw Bot Configuration</h3>

          <div>
            <label className="flow-label-sm">Bot Instance URL</label>
            <input type="url" value={openclawUrl} onChange={(e) => setOpenclawUrl(e.target.value)} placeholder="https://your-openclaw-instance.com" className="flow-input" required />
          </div>

          <div>
            <label className="flow-label-sm">API Token</label>
            <input type="password" value={openclawToken} onChange={(e) => setOpenclawToken(e.target.value)} placeholder="Bearer token for /hooks/agent endpoint" className="flow-input" />
          </div>

          <div>
            <label className="flow-label-sm">Notification Channel</label>
            <select value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)} className="flow-input">
              <option value="whatsapp">WhatsApp</option>
              <option value="telegram">Telegram</option>
              <option value="discord">Discord</option>
            </select>
          </div>
        </div>

        {error && <div className="flow-error">{error}</div>}

        <Button type="submit" variant="primary" size="lg" className="w-full" isLoading={isSubmitting} disabled={isSubmitting}>
          Register as Data Provider
        </Button>
      </form>
    </div>
  );
}
