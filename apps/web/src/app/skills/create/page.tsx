"use client";

import { Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadJsonToIpfs } from "@/lib/ipfs";
import { buildIndexKey, buildManageDataTx, signAndSubmitTx } from "@/lib/stellar";
import Button from "@/components/ui/Button";

const DATA_SOURCES = [
  "fitbit", "strava", "plaid", "spotify", "github",
  "google_fit", "oura", "withings", "garmin", "custom",
];

export default function CreateSkillPage() {
  return (
    <Suspense fallback={null}>
      <CreateSkillInner />
    </Suspense>
  );
}

function CreateSkillInner() {
  const { data: session, status } = useSession();
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
      const stellarAddress = (session?.user as { stellarAddress?: string } | undefined)?.stellarAddress;
      if (!stellarAddress) {
        throw new Error("Wallet not connected");
      }

      const skillId = crypto.randomUUID();
      const skillPayload = {
        id: skillId,
        ...body,
        status: "active",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + body.durationDays * 24 * 60 * 60 * 1000).toISOString(),
      };

      // 1) Frontend -> Pinata HTTPS API
      const ipfsHash = await uploadJsonToIpfs(skillPayload, {
        name: `skill-${skillId.slice(0, 8)}.json`,
        keyvalues: { type: "skill", skillId: skillId.slice(0, 32) },
      });

      // 2) Frontend -> Stellar (Freighter signed manage_data)
      const indexKey = buildIndexKey("skill", skillId);
      const xdr = await buildManageDataTx(stellarAddress, indexKey, ipfsHash);
      const txHash = await signAndSubmitTx(xdr);

      // 3) Backend notify only (facilitator awareness)
      await apiFetch("/api/notify/skill", {
        method: "POST",
        body: JSON.stringify({
          skillId,
          ipfsHash,
          txHash,
          stellarAddress,
          data: body,
        }),
      }).catch((notifyErr) => {
        console.warn("[skills/create] backend notify failed", notifyErr);
      });

      setResult({
        skillId,
        ipfsHash,
        escrowAddress: process.env.NEXT_PUBLIC_PLATFORM_ESCROW_ADDRESS || "DEPLOY_ESCROW_FIRST",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") return null;

  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="flow-surface rounded-xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-emerald-300">
              Data Request Created
            </h2>
            <span className="flow-badge">Active</span>
          </div>
          <p className="mb-4 text-sm text-slate-400">
            Deposit USDC to the escrow address to activate the program. Matching providers will be notified automatically.
          </p>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-400 font-medium">Skill ID</dt>
              <dd className="font-mono text-slate-100">{result.skillId}</dd>
            </div>
            <div>
              <dt className="text-slate-400 font-medium">IPFS Hash</dt>
              <dd className="font-mono text-slate-100">{result.ipfsHash}</dd>
            </div>
            <div>
              <dt className="text-slate-400 font-medium">Escrow Address</dt>
              <dd className="font-mono text-slate-100 break-all">
                {result.escrowAddress}
              </dd>
            </div>
          </dl>
          <div className="mt-6 flex gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => router.push("/dashboard")}
            >
              Go to Dashboard
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResult(null);
                setError(null);
              }}
            >
              Create Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <span className="flow-badge">Skill Builder</span>
      <h1 className="mt-3 text-3xl font-bold text-slate-100">
        Buy Data
      </h1>
      <p className="mt-2 mb-8 text-sm text-slate-400">
        {mcpId
          ? `Using marketplace standard #${mcpId.slice(0, 8)}. Customize the parameters below.`
          : "Define what data you need. Matching providers will be notified and can grant consent."}
      </p>

      {error && <div className="flow-error mb-6">{error}</div>}

      <form onSubmit={handleSubmit} className="flow-surface space-y-6 rounded-xl p-6">
        <div>
          <label className="flow-label">Title</label>
          <input
            name="title"
            required
            className="flow-input"
            placeholder="Fitbit 90-Day Step Data"
          />
        </div>

        <div>
          <label className="flow-label">Description</label>
          <textarea
            name="description"
            required
            rows={3}
            className="flow-input"
            placeholder="Describe what data you need and why..."
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flow-label">Data Source</label>
            <select name="dataSource" required className="flow-input">
              {DATA_SOURCES.map((src) => (
                <option key={src} value={src}>{src}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="flow-label">Duration (days)</label>
            <input
              name="durationDays"
              type="number"
              required
              min={1}
              max={365}
              defaultValue={30}
              className="flow-input"
            />
          </div>
        </div>

        <div>
          <label className="flow-label">Metrics (comma-separated)</label>
          <input
            name="metrics"
            required
            className="flow-input"
            placeholder="steps, heart_rate, calories"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="flow-label">Reward per User (USDC)</label>
            <input
              name="rewardPerUser"
              type="number"
              required
              min={0.01}
              step={0.01}
              defaultValue={1.5}
              className="flow-input"
            />
          </div>
          <div>
            <label className="flow-label">Total Budget (USDC)</label>
            <input
              name="totalBudget"
              type="number"
              required
              min={1}
              step={0.01}
              defaultValue={150}
              className="flow-input"
            />
          </div>
          <div>
            <label className="flow-label">Target Providers</label>
            <input
              name="targetCount"
              type="number"
              required
              min={1}
              defaultValue={100}
              className="flow-input"
            />
          </div>
        </div>

        <div>
          <label className="flow-label">Callback URL (optional)</label>
          <input
            name="callbackUrl"
            type="url"
            className="flow-input"
            placeholder="https://your-api.example/webhook/data-ready"
          />
        </div>

        <Button type="submit" isLoading={submitting} className="w-full">
          Create Request &amp; Upload to IPFS
        </Button>
      </form>
    </div>
  );
}
