"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/buy", label: "Buy Data" },
  { href: "/sell", label: "Sell Data" },
];

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-slate-800/90 bg-slate-950/85 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-slate-100">
                PDE
              </span>
              <span className="hidden rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300 md:inline">
                Data Exchange
              </span>
            </Link>
            {status === "authenticated" && (
              <div className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === link.href || pathname?.startsWith(link.href + "/")
                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-400/30"
                        : "text-slate-300 hover:text-white hover:bg-slate-900"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            {status === "authenticated" && session?.user ? (
              <>
                <div className="hidden sm:flex flex-col items-end text-xs">
                  <span className="text-slate-400 font-mono">
                    {session.user.stellarAddress?.slice(0, 6)}...
                    {session.user.stellarAddress?.slice(-4)}
                  </span>
                  <span className="text-slate-500">
                    {session.user.stellarAddress?.slice(0, 8)}
                  </span>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="text-sm text-slate-400 hover:text-white transition-colors"
                >
                  Sign Out
                </button>
              </>
            ) : status === "unauthenticated" ? (
              <Link
                href="/login"
                className="rounded-md border border-emerald-400/30 bg-emerald-500/15 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20 transition-colors"
              >
                Sign In
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
