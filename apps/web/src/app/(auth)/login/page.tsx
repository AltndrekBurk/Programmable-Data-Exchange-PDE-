"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useFreighter } from "@/hooks/useFreighter";
import Button from "@/components/ui/Button";

type Step = "idle" | "connecting" | "signing" | "verifying" | "error";

const stepLabel: Record<Step, string> = {
  idle: "Connect with Freighter",
  connecting: "Opening wallet...",
  signing: "Waiting for signature...",
  verifying: "Verifying...",
  error: "Try Again",
};

export default function LoginPage() {
  const router = useRouter();
  const freighter = useFreighter();
  const [step, setStep] = useState<Step>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isLoading =
    step === "connecting" || step === "signing" || step === "verifying";

  const handleConnect = async () => {
    setErrorMsg(null);
    setStep("connecting");

    const publicKey = await freighter.connect();
    if (!publicKey) {
      setErrorMsg(freighter.error || "Failed to connect wallet");
      setStep("error");
      return;
    }

    setStep("signing");

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    let challenge: string;
    try {
      const res = await fetch(
        `${apiUrl}/api/auth/challenge?address=${publicKey}`
      );
      if (!res.ok) {
        throw new Error(`Server error: ${res.status}`);
      }
      const data = await res.json();
      challenge = data.challenge;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not reach server";
      setErrorMsg(msg);
      setStep("error");
      return;
    }

    const signature = await freighter.signChallenge(challenge);
    if (!signature) {
      setErrorMsg(freighter.error || "Signature cancelled or failed");
      setStep("error");
      return;
    }

    setStep("verifying");

    const result = await signIn("credentials", {
      publicKey,
      signature,
      challenge,
      redirect: false,
    });

    if (!result?.ok || result?.error) {
      setErrorMsg("Authentication failed");
      setStep("error");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-100">
          Sign in to PDE
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Secure, anonymous authentication via your Stellar wallet
        </p>
      </div>

      <div
        className="w-16 h-16 rounded-full border border-emerald-400/40 bg-slate-950 flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-emerald-300 text-2xl font-bold">XLM</span>
      </div>

      <div className="w-full space-y-3">
        <Button
          onClick={handleConnect}
          variant="primary"
          size="lg"
          className="w-full"
          isLoading={isLoading}
          disabled={isLoading}
          aria-busy={isLoading}
        >
          {stepLabel[step]}
        </Button>

        {errorMsg && (
          <div
            role="alert"
            className="flow-error"
          >
            <p>{errorMsg}</p>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-slate-500 space-y-1">
        <p>Don&apos;t have Freighter installed?</p>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-emerald-300 hover:underline"
        >
          Download from freighter.app
        </a>
      </div>

      <p className="text-center text-xs text-slate-500">
        Your real identity is never stored &mdash; only an anonymous pseudonym ID is used
      </p>
    </div>
  );
}
