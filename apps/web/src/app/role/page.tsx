"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useRole, Role } from "@/hooks/useRole";
import { useFreighter } from "@/hooks/useFreighter";
import { writeIndexFromClient } from "@/lib/stellar";

export default function RoleSelectionPage() {
  const { status, data: session } = useSession();
  const router = useRouter();
  const { role, setRole, isLoading: roleLoading } = useRole();
  const { publicKey } = useFreighter();
  const [selecting, setSelecting] = useState<Role | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  if (status === "loading" || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
      </div>
    );
  }

  if (status !== "authenticated") return null;

  const stellarAddress = session?.user?.stellarAddress ?? null;

  const handleSelect = async (selected: Role) => {
    setSelecting(selected);
    setRole(selected);

    // Fire-and-forget: write role to Stellar manage_data
    if (publicKey && stellarAddress) {
      writeIndexFromClient(publicKey, "role", stellarAddress, selected).catch(
        (err) => console.warn("[role] Stellar manage_data write failed:", err)
      );
    }

    if (selected === "buyer") {
      router.push("/buyer/dashboard");
    } else {
      router.push("/seller/dashboard");
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight text-slate-100">
          Choose Your Role
        </h1>
        <p className="mt-3 text-sm text-slate-400">
          How would you like to participate in the data economy?
        </p>
      </div>

      <div className="grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-2">
        {/* Data Buyer Card */}
        <button
          onClick={() => handleSelect("buyer")}
          disabled={selecting !== null}
          className={`group relative flex flex-col items-center gap-5 rounded-2xl border p-8 text-center transition-all duration-200 ${
            selecting === "buyer"
              ? "border-emerald-400/60 bg-emerald-500/15 ring-2 ring-emerald-400/30"
              : "border-slate-700/60 bg-slate-900/60 hover:border-emerald-400/40 hover:bg-emerald-500/5"
          } ${selecting !== null && selecting !== "buyer" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/30 bg-emerald-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-100">
              Data Buyer
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Request and purchase verified data from providers.
              Create skills, lock USDC in escrow, and receive ZK-proven results.
            </p>
          </div>

          <span className="mt-auto inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-300 transition-colors group-hover:bg-emerald-500/20">
            {selecting === "buyer" ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-emerald-300 border-t-transparent" />
                Selecting...
              </>
            ) : (
              "Select Buyer"
            )}
          </span>
        </button>

        {/* Data Seller Card */}
        <button
          onClick={() => handleSelect("seller")}
          disabled={selecting !== null}
          className={`group relative flex flex-col items-center gap-5 rounded-2xl border p-8 text-center transition-all duration-200 ${
            selecting === "seller"
              ? "border-cyan-400/60 bg-cyan-500/15 ring-2 ring-cyan-400/30"
              : "border-slate-700/60 bg-slate-900/60 hover:border-cyan-400/40 hover:bg-cyan-500/5"
          } ${selecting !== null && selecting !== "seller" ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          {/* Icon */}
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-500/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8 text-cyan-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
              />
            </svg>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-slate-100">
              Data Seller
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Monetize your data with ZK-TLS proofs.
              Accept tasks, generate verified proofs, and earn USDC automatically.
            </p>
          </div>

          <span className="mt-auto inline-flex items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-cyan-300 transition-colors group-hover:bg-cyan-500/20">
            {selecting === "seller" ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border border-cyan-300 border-t-transparent" />
                Selecting...
              </>
            ) : (
              "Select Seller"
            )}
          </span>
        </button>
      </div>

      <p className="mt-8 text-center text-xs text-slate-500">
        You can switch your role at any time from the navigation menu.
      </p>
    </div>
  );
}
