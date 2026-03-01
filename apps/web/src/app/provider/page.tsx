"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Button from "@/components/ui/Button";

const DATA_SOURCES = [
  { id: "fitbit", label: "Fitbit", type: "api" as const },
  { id: "strava", label: "Strava", type: "api" as const },
  { id: "spotify", label: "Spotify", type: "api" as const },
  { id: "github", label: "GitHub", type: "api" as const },
  { id: "google_fit", label: "Google Fit", type: "api" as const },
  { id: "plaid", label: "Plaid (Bank)", type: "api" as const },
  { id: "garmin", label: "Garmin", type: "api" as const },
  { id: "whoop", label: "WHOOP", type: "api" as const },
];

const DEVICE_SOURCES = [
  { id: "gps", label: "GPS / Konum", type: "device" as const },
  { id: "accelerometer", label: "Accelerometer", type: "device" as const },
  { id: "heart_sensor", label: "Heart Rate Sensor", type: "device" as const },
  { id: "camera", label: "Camera", type: "device" as const },
];

export default function ProviderRegistrationPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [openclawUrl, setOpenclawUrl] = useState("");
  const [channel, setChannel] = useState<"whatsapp" | "telegram" | "discord">("whatsapp");
  const [contactInfo, setContactInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === "loading") {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/login");
    return null;
  }

  const toggleSource = (id: string) => {
    setSelectedSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedSources.length === 0) {
      setError("En az bir veri kaynagi secmelisiniz");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/provider/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stellarAddress: (session?.user as { stellarAddress?: string })?.stellarAddress,
          dataSources: selectedSources,
          openclawUrl: openclawUrl || undefined,
          channel,
          contactInfo,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Sunucu hatasi: ${res.status}`);
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kayit basarisiz");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <h2 className="text-xl font-bold text-green-800 mb-2">Kayit Basarili!</h2>
          <p className="text-green-700 mb-4">
            Veri saglayici olarak kaydoldunuz. Gorevler sayfasindan bekleyen gorevleri gorebilirsiniz.
          </p>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.push("/tasks")} variant="primary">
              Gorevlere Git
            </Button>
            <Button onClick={() => router.push("/dashboard")} variant="secondary">
              Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Veri Saglayici Kaydi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Desteklediginiz veri kaynaklarini secin ve OpenClaw bot ayarlarinizi yapin
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* API Veri Kaynaklari */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            API Veri Kaynaklari (MVP)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DATA_SOURCES.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => toggleSource(source.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  selectedSources.includes(source.id)
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {source.label}
              </button>
            ))}
          </div>
        </div>

        {/* Device Veri Kaynaklari */}
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-1">
            Cihaz Veri Kaynaklari (Phase 2)
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            TEE + runtime attestation gerekli — yakinda aktif olacak
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DEVICE_SOURCES.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => toggleSource(source.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  selectedSources.includes(source.id)
                    ? "bg-purple-50 border-purple-300 text-purple-700"
                    : "bg-white border-gray-200 text-gray-400 hover:border-gray-300"
                }`}
              >
                {source.label}
              </button>
            ))}
          </div>
        </div>

        {/* OpenClaw Ayarlari */}
        <div className="border-t pt-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            OpenClaw Bot Ayarlari
          </h3>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                OpenClaw URL (opsiyonel)
              </label>
              <input
                type="url"
                value={openclawUrl}
                onChange={(e) => setOpenclawUrl(e.target.value)}
                placeholder="https://your-openclaw.example.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Bildirim Kanali
              </label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as typeof channel)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="discord">Discord</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Iletisim (telefon veya kullanici adi)
              </label>
              <input
                type="text"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                placeholder="+905551234567 veya @username"
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isSubmitting}
          disabled={isSubmitting || selectedSources.length === 0}
        >
          Saglayici Olarak Kaydol
        </Button>
      </form>
    </div>
  );
}
