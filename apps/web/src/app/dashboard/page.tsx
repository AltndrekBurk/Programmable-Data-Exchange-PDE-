"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";

interface Skill {
  id: string;
  title: string;
  dataSource: string;
  rewardPerUser: number;
  status: string;
  expiresAt: string;
}

interface DashboardData {
  skills: Skill[];
  totalSkills: number;
}

interface ProviderInfo {
  registered: boolean;
  dataSources?: string[];
  openclawUrl?: string;
  channel?: string;
  contactInfo?: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // OpenClaw bot config form
  const [showBotSetup, setShowBotSetup] = useState(false);
  const [botUrl, setBotUrl] = useState("");
  const [botToken, setBotToken] = useState("");
  const [botSaving, setBotSaving] = useState(false);
  const [botSaved, setBotSaved] = useState(false);

  // LLM Proof test
  const [llmPrompt, setLlmPrompt] = useState("");
  const [llmResult, setLlmResult] = useState<string | null>(null);
  const [llmLoading, setLlmLoading] = useState(false);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

    // Fetch skills
    apiFetch<DashboardData>("/api/skills")
      .then((data) => setSkills(data.skills || []))
      .catch(() => setSkills([]));

    // Fetch provider status
    fetch(`${apiUrl}/api/provider/me?address=${stellarAddress}`)
      .then((res) => res.json())
      .then((data) => setProvider(data))
      .catch(() => setProvider(null))
      .finally(() => setLoading(false));
  }, [status, stellarAddress]);

  const handleSaveBot = async () => {
    setBotSaving(true);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/provider/bot-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stellarAddress,
          openclawUrl: botUrl,
          openclawToken: botToken,
        }),
      });
      if (res.ok) {
        setBotSaved(true);
        setTimeout(() => setBotSaved(false), 3000);
      }
    } catch {
      // silently fail for now
    } finally {
      setBotSaving(false);
    }
  };

  const handleLlmProofTest = async () => {
    if (!llmPrompt.trim()) return;
    setLlmLoading(true);
    setLlmResult(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/proofs/llm-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: llmPrompt,
          stellarAddress,
        }),
      });
      const data = await res.json();
      setLlmResult(
        data.verified
          ? `Dogrulanmis! Hash: ${data.proofHash?.slice(0, 16)}... | Timestamp: ${data.timestamp}`
          : data.error || "Dogrulama basarisiz"
      );
    } catch {
      setLlmResult("Sunucuya baglanilamadi");
    } finally {
      setLlmLoading(false);
    }
  };

  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="h-4 w-96 bg-gray-200 rounded" />
          <div className="grid grid-cols-3 gap-4 mt-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-gray-200 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hosgeldin,{" "}
            <span className="font-mono">
              {session?.user?.pseudoId?.slice(0, 8)}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/skills/create"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Yeni Veri Talebi
          </Link>
          {!provider?.registered && (
            <Link
              href="/provider"
              className="rounded-md border border-blue-600 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 transition-colors"
            >
              Saglayici Ol
            </Link>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Aktif Gorevler</p>
          <p className="text-2xl font-bold text-gray-900">{skills.length}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Toplam Kazanc</p>
          <p className="text-2xl font-bold text-gray-900">0.00 USDC</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Onaylanan Proof</p>
          <p className="text-2xl font-bold text-gray-900">0</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Saglayici Durumu</p>
          <p className={`text-2xl font-bold ${provider?.registered ? "text-green-600" : "text-gray-400"}`}>
            {provider?.registered ? "Aktif" : "Kayitsiz"}
          </p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Link href="/proofs" className="rounded-lg border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors text-center">
          <p className="text-sm font-medium text-gray-700">ZK Prooflar</p>
          <p className="text-xs text-gray-400">Kanit gecmisi</p>
        </Link>
        <Link href="/escrow" className="rounded-lg border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors text-center">
          <p className="text-sm font-medium text-gray-700">Escrow</p>
          <p className="text-xs text-gray-400">USDC durumu</p>
        </Link>
        <Link href="/marketplace" className="rounded-lg border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors text-center">
          <p className="text-sm font-medium text-gray-700">Marketplace</p>
          <p className="text-xs text-gray-400">MCP standartlari</p>
        </Link>
        <Link href="/tasks" className="rounded-lg border border-gray-200 p-3 hover:border-blue-300 hover:bg-blue-50 transition-colors text-center">
          <p className="text-sm font-medium text-gray-700">Gorevler</p>
          <p className="text-xs text-gray-400">Bekleyen isler</p>
        </Link>
      </div>

      {/* OpenClaw Bot Integration */}
      <div className="rounded-lg border border-gray-200">
        <div className="border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">OpenClaw Bot Entegrasyonu</h2>
            <p className="text-xs text-gray-400">WhatsApp/Telegram/Discord uzerinden gorev bildirimleri al</p>
          </div>
          <button
            onClick={() => setShowBotSetup(!showBotSetup)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            {showBotSetup ? "Kapat" : "Ayarla"}
          </button>
        </div>

        {showBotSetup && (
          <div className="p-4 space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm text-blue-700">
              <p className="font-medium mb-1">OpenClaw Nedir?</p>
              <p className="text-xs">
                OpenClaw, self-hosted AI gateway&apos;inizdir. Gorev bildirimleri WhatsApp/Telegram/Discord
                uzerinden gelir. Kabul ederseniz, OpenClaw otomatik olarak ZK proof uretir ve platforma gonderir.
              </p>
              <a
                href="https://github.com/nicholasgriffintn/openclaw"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 underline mt-1 inline-block"
              >
                OpenClaw GitHub &rarr;
              </a>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">OpenClaw URL</label>
                <input
                  type="url"
                  value={botUrl}
                  onChange={(e) => setBotUrl(e.target.value)}
                  placeholder="https://your-openclaw.example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">API Token</label>
                <input
                  type="password"
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder="openclaw-api-token"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveBot}
                disabled={botSaving || !botUrl}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {botSaving ? "Kaydediliyor..." : "Bot Ayarlarini Kaydet"}
              </button>
              {botSaved && (
                <span className="text-sm text-green-600">Kaydedildi!</span>
              )}
            </div>

            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-2">Test Mesaji Gonder</p>
              <button
                onClick={async () => {
                  if (!botUrl) return;
                  try {
                    await fetch(`${botUrl}/hooks/agent`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...(botToken ? { Authorization: `Bearer ${botToken}` } : {}),
                      },
                      body: JSON.stringify({
                        message: "dataEconomy test mesaji! Bot entegrasyonu basarili.",
                        name: "DataEconomy-Test",
                        agentId: "main",
                        sessionKey: "test-ping",
                        wakeMode: "now",
                        deliver: true,
                      }),
                    });
                    alert("Test mesaji gonderildi!");
                  } catch {
                    alert("Baglanamadi. URL ve token kontrol edin.");
                  }
                }}
                disabled={!botUrl}
                className="px-3 py-1.5 border border-gray-300 text-xs rounded-md hover:bg-gray-50 disabled:opacity-50"
              >
                Test Gonder
              </button>
            </div>
          </div>
        )}
      </div>

      {/* LLM Proof Verification */}
      <div className="rounded-lg border border-gray-200">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">LLM Kanit Dogrulamasi</h2>
          <p className="text-xs text-gray-400">
            ZK-TLS ile LLM API cagrisinin gercekten yapildigini kanitla
          </p>
        </div>

        <div className="p-4 space-y-3">
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-xs text-purple-700">
            <p className="font-medium mb-1">Nasil Calisir?</p>
            <p>
              Reclaim Protocol zkFetch ile bir LLM API&apos;sine (OpenAI, Anthropic vs.) istek atilir.
              ZK-TLS kaniti, istegin gercekten o API&apos;ye yapildigini ve belirli bir yanit aldiginizi
              kimseye gostermeden kanitlar. Veri ekonomisinde LLM ciktilarinin dogrulugunun teyidi icin kullanilir.
            </p>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Test Promptu (LLM API&apos;sine gonderilecek)
            </label>
            <textarea
              value={llmPrompt}
              onChange={(e) => setLlmPrompt(e.target.value)}
              placeholder="Ornek: Turkiye'nin baskenti neresidir?"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleLlmProofTest}
              disabled={llmLoading || !llmPrompt.trim()}
              className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
            >
              {llmLoading ? "Kanit Uretiliyor..." : "ZK-TLS Kaniti Uret"}
            </button>
          </div>

          {llmResult && (
            <div className={`rounded-lg p-3 text-sm ${
              llmResult.startsWith("Dogrulanmis")
                ? "bg-green-50 border border-green-200 text-green-700"
                : "bg-red-50 border border-red-200 text-red-700"
            }`}>
              {llmResult}
            </div>
          )}
        </div>
      </div>

      {/* Skills/Tasks List */}
      <div className="rounded-lg border border-gray-200">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Veri Talepleri
          </h2>
        </div>
        {skills.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-gray-500">
              Henuz veri talebi yok.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <Link
                href="/skills/create"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Veri talep et
              </Link>
              <span className="text-gray-300">|</span>
              <Link
                href="/marketplace"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Marketplace&apos;e goz at
              </Link>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {skills.map((skill) => (
              <li key={skill.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {skill.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {skill.dataSource} — {skill.rewardPerUser} USDC/kullanici
                  </p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                    skill.status === "active"
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-50 text-gray-600"
                  }`}
                >
                  {skill.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
