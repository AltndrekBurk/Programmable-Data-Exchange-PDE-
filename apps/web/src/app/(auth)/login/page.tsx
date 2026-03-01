"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useFreighter } from "@/hooks/useFreighter";
import Button from "@/components/ui/Button";

type Step = "idle" | "connecting" | "signing" | "verifying" | "error";

const stepLabel: Record<Step, string> = {
  idle: "Freighter ile Bağlan",
  connecting: "Cüzdan açılıyor...",
  signing: "İmzalama bekleniyor...",
  verifying: "Doğrulanıyor...",
  error: "Tekrar Dene",
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

    // 1. Freighter'a bağlan, public key al
    const publicKey = await freighter.connect();
    if (!publicKey) {
      setErrorMsg(freighter.error || "Cüzdan bağlanamadı");
      setStep("error");
      return;
    }

    setStep("signing");

    // 2. Backend'den challenge al
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
    let challenge: string;
    try {
      const res = await fetch(
        `${apiUrl}/api/auth/challenge?address=${publicKey}`
      );
      if (!res.ok) {
        throw new Error(`Sunucu hatası: ${res.status}`);
      }
      const data = await res.json();
      challenge = data.challenge;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Sunucuya bağlanılamadı";
      setErrorMsg(msg);
      setStep("error");
      return;
    }

    // 3. Challenge'ı imzala
    const signature = await freighter.signChallenge(challenge);
    if (!signature) {
      setErrorMsg(freighter.error || "İmzalama iptal edildi veya başarısız");
      setStep("error");
      return;
    }

    setStep("verifying");

    // 4. NextAuth credentials provider ile giriş
    const result = await signIn("credentials", {
      publicKey,
      signature,
      challenge,
      redirect: false,
    });

    if (!result?.ok || result?.error) {
      setErrorMsg("Kimlik doğrulama başarısız");
      setStep("error");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          dataEconomy&apos;ye Giriş
        </h2>
        <p className="mt-2 text-sm text-gray-500">
          Stellar cüzdanınla güvenli, anonim giriş yap
        </p>
      </div>

      <div
        className="w-16 h-16 rounded-full bg-black flex items-center justify-center"
        aria-hidden="true"
      >
        <span className="text-white text-2xl font-bold">XLM</span>
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
            className="rounded-md bg-red-50 border border-red-200 p-3"
          >
            <p className="text-sm text-red-700">{errorMsg}</p>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-gray-400 space-y-1">
        <p>Freighter yüklü değil mi?</p>
        <a
          href="https://freighter.app"
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline"
        >
          freighter.app üzerinden indir
        </a>
      </div>

      <p className="text-center text-xs text-gray-400">
        Gerçek kimliğin saklanmaz &mdash; sadece anonim ID kullanılır
      </p>
    </div>
  );
}
