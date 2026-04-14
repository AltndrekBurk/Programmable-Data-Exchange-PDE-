"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { apiFetch } from "@/lib/api";
import { uploadJsonToIpfs, fetchFromIpfs } from "@/lib/ipfs";
import { buildManageDataTx, signAndSubmitTx, readAccountData, PREFIXES } from "@/lib/stellar";
import { getPlatformAddress } from "@/lib/chain-reader";

/* ── Types ── */
interface BotConfig {
  botUrl: string;
  botToken: string;
  attestorUrl: string;
  stellarAddress: string;
  configuredAt: string;
}

export default function SellerBotSetupPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [botUrl, setBotUrl] = useState("");
  const [botToken, setBotToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [existingConfig, setExistingConfig] = useState<BotConfig | null>(null);

  const stellarAddress = (session?.user as { stellarAddress?: string })?.stellarAddress;

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  /* ── Load existing bot config from chain ── */
  useEffect(() => {
    if (status !== "authenticated" || !stellarAddress) return;

    const loadConfig = async () => {
      try {
        const platformAddr = getPlatformAddress();
        if (!platformAddr) {
          setLoading(false);
          return;
        }

        const accountData = await readAccountData(platformAddr);
        const botKey = `${PREFIXES.botconfig}${stellarAddress.slice(0, 24)}`;
        const cid = accountData.get(botKey);

        if (cid) {
          try {
            const data = await fetchFromIpfs<BotConfig>(cid);
            if (data) {
              setExistingConfig(data);
              if (data.botUrl) setBotUrl(data.botUrl);
            }
          } catch {
            // no config found
          }
        }

        // Also check provider record for openclawUrl
        const providerKey = `${PREFIXES.provider}${stellarAddress.slice(0, 24)}`;
        const providerCid = accountData.get(providerKey);
        if (providerCid && !botUrl) {
          try {
            const pData = await fetchFromIpfs<Record<string, unknown>>(providerCid);
            if (pData?.openclawUrl) {
              setBotUrl(pData.openclawUrl as string);
            }
          } catch {
            // silent
          }
        }
      } catch (err) {
        console.error("[bot-setup] load failed:", err);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, [status, stellarAddress]);

  /* ── Test Connection ── */
  const handleTest = async () => {
    if (!botUrl) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(botUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(5000),
      });
      setTestResult(res.ok ? "connected" : `error: HTTP ${res.status}`);
    } catch {
      setTestResult("unreachable");
    } finally {
      setTesting(false);
    }
  };

  /* ── Save Bot Config ── */
  const handleSave = async () => {
    if (!stellarAddress) {
      setError("Wallet not connected.");
      return;
    }
    if (!botUrl) {
      setError("Bot URL is required.");
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      // Step 1: Upload config to IPFS (without sensitive token)
      const configData = {
        botUrl,
        stellarAddress,
        configuredAt: new Date().toISOString(),
      };

      const configCid = await uploadJsonToIpfs(configData, {
        name: `bot-config-${stellarAddress.slice(0, 8)}.json`,
        keyvalues: { type: "bot-config" },
      });

      // Step 2: Index on Stellar (bc: prefix)
      const shortId = stellarAddress.slice(0, 24);
      const indexKey = `${PREFIXES.botconfig}${shortId}`;
      const xdr = await buildManageDataTx(stellarAddress, indexKey, configCid);
      await signAndSubmitTx(xdr);

      // Step 3: Save sensitive bot token to backend only
      if (botToken) {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        await fetch(`${apiUrl}/api/provider/bot-config`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stellarAddress,
            openclawUrl: botUrl,
            openclawToken: botToken,
          }),
        }).catch(() => {});
      }

      setExistingConfig({ ...configData, botToken: "", attestorUrl: "" });
      setSaved(true);
      setTimeout(() => setSaved(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save bot config");
    } finally {
      setSaving(false);
    }
  };

  /* ── Generate .env template ── */
  const generateEnvTemplate = () => {
    const template = `# PDE Seller Bot Configuration
# Generated for: ${stellarAddress || "YOUR_STELLAR_ADDRESS"}

# Stellar Configuration
STELLAR_ADDRESS=${stellarAddress || "YOUR_STELLAR_ADDRESS"}
STELLAR_NETWORK=testnet
HORIZON_URL=https://horizon-testnet.stellar.org
SOROBAN_RPC_URL=https://soroban-testnet.stellar.org

# OpenClaw Configuration
OPENCLAW_PORT=3002
OPENCLAW_API_TOKEN=your-secure-token-here

# PDE Platform
PDE_API_URL=${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}
PDE_PLATFORM_ADDRESS=${process.env.NEXT_PUBLIC_STELLAR_PLATFORM_PUBLIC || "PLATFORM_ADDRESS"}

# Attestor-Core Configuration
ATTESTOR_PORT=8001
ATTESTOR_PRIVATE_KEY=your-ed25519-private-key-here

# IPFS / Pinata
PINATA_JWT=your-pinata-jwt-here
PINATA_GATEWAY=https://gateway.pinata.cloud
`;

    const blob = new Blob([template], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".env.seller";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Generate seller-agent.md ── */
  const generateAgentMd = () => {
    const content = `# PDE Seller Agent Configuration
## Auto-generated for ${stellarAddress || "YOUR_ADDRESS"}

### Overview
This file configures your OpenClaw bot instance as a PDE seller agent.
The bot listens for data requests, generates ZK-TLS proofs via attestor-core,
and delivers encrypted data to buyers through the PDE platform.

### Prerequisites
1. OpenClaw instance running and accessible
2. Attestor-core deployed on port 8001
3. Stellar testnet account funded via Friendbot
4. Registered as seller on PDE platform

### MCP Tools Available
Your bot can use these MCP tools to interact with data sources:
- \`fitbit_daily_steps\` - Fetch Fitbit daily step count
- \`strava_activities\` - Fetch Strava running/cycling activities
- \`spotify_top_tracks\` - Fetch Spotify top tracks
- Custom providers via zkFetch

### Consent Flow
1. Platform notifies bot of new data request (POST /hooks/agent)
2. Bot evaluates request against seller policy
3. If auto-accept enabled and matches policy: accept automatically
4. Otherwise: forward to seller via configured channel (WhatsApp/Telegram/Discord)
5. On acceptance: bot signs consent TX on Stellar

### Proof Generation
1. Bot receives accepted task details
2. Fetches data from source API via zkFetch
3. Attestor-core generates ZK-TLS proof
4. Bot encrypts data with buyer's deliveryPublicKey
5. Submits encrypted payload + proof to PDE platform
6. Platform verifies proof and triggers escrow release

### Error Handling
- Retry failed API calls up to 3 times with exponential backoff
- Log all errors to stderr for monitoring
- Notify seller via channel on critical failures
- Never expose raw data in logs or error messages

### Security
- Never log plaintext data
- Always encrypt before delivery
- Verify buyer's deliveryPublicKey before encryption
- Use HTTPS for all external communications
`;

    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "seller-agent.md";
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Code block helper ── */
  const CodeBlock = ({ children, title }: { children: string; title?: string }) => (
    <div className="rounded-lg border border-slate-700 bg-slate-950 overflow-hidden">
      {title && (
        <div className="border-b border-slate-800 px-3 py-1.5 text-[10px] font-medium text-slate-500 uppercase tracking-wide">
          {title}
        </div>
      )}
      <pre className="p-3 text-xs text-slate-300 overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  );

  /* ── Loading ── */
  if (status === "loading" || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-56 rounded bg-slate-900" />
          <div className="h-4 w-80 rounded bg-slate-900" />
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 rounded-lg bg-slate-900" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-8">
      {/* ── Header ── */}
      <div>
        <span className="flow-badge">Bot Setup</span>
        <h1 className="mt-3 text-3xl font-bold text-slate-100">Set Up Your Seller Bot</h1>
        <p className="mt-2 text-sm text-slate-400">
          Deploy an OpenClaw bot with attestor-core for automated ZK proof generation and data delivery.
        </p>
      </div>

      {/* ── Step 1: Install OpenClaw ── */}
      <div className="flow-surface rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 text-sm font-bold text-emerald-300">
            1
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">Install OpenClaw</h2>
            <p className="mt-1 text-sm text-slate-400">
              Clone and set up your self-hosted OpenClaw instance. This is the AI gateway that handles task delivery and proof pipeline.
            </p>
          </div>
        </div>

        <CodeBlock title="Terminal">{`git clone https://github.com/nicholasgriffintn/openclaw.git
cd openclaw
npm install
cp .env.example .env
# Edit .env with your configuration
npm run dev`}</CodeBlock>

        <p className="text-xs text-slate-500">
          OpenClaw must expose the <code className="rounded bg-slate-800 px-1 py-0.5 text-emerald-300">POST /hooks/agent</code> endpoint for receiving task notifications from PDE.
        </p>
      </div>

      {/* ── Step 2: Configure Environment ── */}
      <div className="flow-surface rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 text-sm font-bold text-emerald-300">
            2
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">Configure Environment</h2>
            <p className="mt-1 text-sm text-slate-400">
              Set up your environment variables. Your Stellar address is pre-filled.
            </p>
          </div>
        </div>

        <CodeBlock title=".env">{`# Stellar
STELLAR_ADDRESS=${stellarAddress || "YOUR_STELLAR_ADDRESS"}
STELLAR_NETWORK=testnet

# OpenClaw
OPENCLAW_PORT=3002
OPENCLAW_API_TOKEN=your-secure-token

# PDE Platform
PDE_API_URL=${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}

# Attestor
ATTESTOR_URL=http://localhost:8001
ATTESTOR_PRIVATE_KEY=your-ed25519-private-key`}</CodeBlock>

        <button
          onClick={generateEnvTemplate}
          className="rounded-md border border-emerald-400/40 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
        >
          Download .env Template
        </button>
      </div>

      {/* ── Step 3: Deploy Attestor-Core ── */}
      <div className="flow-surface rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 text-sm font-bold text-emerald-300">
            3
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">Deploy Attestor-Core</h2>
            <p className="mt-1 text-sm text-slate-400">
              The attestor-core instance generates real ZK-TLS proofs for your data. This is critical for proof verification.
            </p>
          </div>
        </div>

        <CodeBlock title="Terminal">{`git clone https://github.com/reclaimprotocol/attestor-core.git
cd attestor-core
npm install

# Create .env file
echo "PRIVATE_KEY=your-ed25519-private-key-here" > .env

# Start attestor on port 8001
npm run start:tsc`}</CodeBlock>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-300">
          The attestor-core replaces Reclaim Protocol's hosted system. It runs standalone without APP_ID requirements, enabling zkFetch against any web API.
        </div>
      </div>

      {/* ── Step 4: Connect to PDE ── */}
      <div className="flow-surface rounded-xl p-6 space-y-5">
        <div className="flex items-start gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/15 text-sm font-bold text-emerald-300">
            4
          </span>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-slate-100">Connect to PDE</h2>
            <p className="mt-1 text-sm text-slate-400">
              Register your bot URL and token with the platform. This allows PDE to send task notifications to your bot.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="flow-label-sm">Bot URL</label>
            <input
              type="url"
              value={botUrl}
              onChange={(e) => setBotUrl(e.target.value)}
              placeholder="https://your-openclaw-instance.com"
              className="flow-input"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Must expose POST /hooks/agent endpoint.
            </p>
          </div>
          <div>
            <label className="flow-label-sm">Bot Token</label>
            <input
              type="password"
              value={botToken}
              onChange={(e) => setBotToken(e.target.value)}
              placeholder="Bearer token for /hooks/agent"
              className="flow-input"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Stored securely on backend only, never on IPFS.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleTest}
            disabled={testing || !botUrl}
            className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 disabled:opacity-50 transition-colors"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          {testResult && (
            <span
              className={`flex items-center text-xs ${
                testResult === "connected" ? "text-emerald-300" : "text-red-400"
              }`}
            >
              {testResult === "connected"
                ? "Bot reachable"
                : `Connection failed: ${testResult}`}
            </span>
          )}
        </div>

        {/* Existing config info */}
        {existingConfig && (
          <div className="rounded-lg border border-slate-700 bg-slate-900/40 px-4 py-2 text-xs text-slate-400">
            Existing config found. Bot URL:{" "}
            <span className="font-mono text-emerald-300">{existingConfig.botUrl}</span>
            {existingConfig.configuredAt && (
              <>
                {" | "}Configured: {new Date(existingConfig.configuredAt).toLocaleString()}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Error / Success ── */}
      {error && <div className="flow-error">{error}</div>}

      {saved && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-300">
          Bot configuration saved to IPFS + Stellar. Token stored securely on backend.
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="lg"
          onClick={handleSave}
          isLoading={saving}
          disabled={saving || !botUrl}
          className="min-w-[200px]"
        >
          Save Bot Config
        </Button>

        <button
          onClick={generateAgentMd}
          className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900 transition-colors"
        >
          Download seller-agent.md
        </button>

        <Link
          href="/seller/dashboard"
          className="text-sm text-slate-400 hover:text-slate-200 transition-colors"
        >
          Back to Dashboard
        </Link>
      </div>

      {/* ── Architecture Note ── */}
      <div className="flow-surface rounded-xl p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
          How It Works
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs text-slate-400">
          <div className="rounded-md border border-slate-700 bg-slate-900/40 p-3 text-center">
            <p className="font-medium text-slate-200 mb-1">PDE Platform</p>
            <p>Sends task notifications to your bot via POST /hooks/agent</p>
          </div>
          <div className="rounded-md border border-slate-700 bg-slate-900/40 p-3 text-center">
            <p className="font-medium text-slate-200 mb-1">OpenClaw Bot</p>
            <p>Receives tasks, fetches data from APIs, coordinates proof generation</p>
          </div>
          <div className="rounded-md border border-slate-700 bg-slate-900/40 p-3 text-center">
            <p className="font-medium text-slate-200 mb-1">Attestor-Core</p>
            <p>Generates ZK-TLS proofs via Reclaim Protocol zkFetch</p>
          </div>
          <div className="rounded-md border border-slate-700 bg-slate-900/40 p-3 text-center">
            <p className="font-medium text-slate-200 mb-1">Stellar</p>
            <p>Records consent TX, triggers escrow release on proof verification</p>
          </div>
        </div>
      </div>
    </div>
  );
}
