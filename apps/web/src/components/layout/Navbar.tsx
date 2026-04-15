"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useRole } from "@/hooks/useRole";

type NavLink = { href: string; label: string };

const buyerLinks: NavLink[] = [
  { href: "/agent", label: "Agent Console" },
  { href: "/buyer/dashboard", label: "Dashboard" },
  { href: "/buyer/request", label: "Create Request" },
  { href: "/buyer/requests", label: "My Requests" },
  { href: "/marketplace", label: "Marketplace" },
];

const sellerLinks: NavLink[] = [
  { href: "/agent", label: "Agent Console" },
  { href: "/seller/dashboard", label: "Dashboard" },
  { href: "/seller/policy", label: "My Policy" },
  { href: "/seller/tasks", label: "Active Tasks" },
  { href: "/seller/bot-setup", label: "Bot Setup" },
];

const defaultLinks: NavLink[] = [
  { href: "/agent", label: "Agent Console" },
  { href: "/role", label: "Dashboard" },
  { href: "/marketplace", label: "Marketplace" },
];

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const { role } = useRole();

  const navLinks =
    role === "buyer"
      ? buyerLinks
      : role === "seller"
        ? sellerLinks
        : defaultLinks;

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
                <div className="hidden sm:flex items-center gap-2">
                  <div className="flex flex-col items-end text-xs">
                    <span className="text-slate-400 font-mono">
                      {session.user.stellarAddress?.slice(0, 6)}...
                      {session.user.stellarAddress?.slice(-4)}
                    </span>
                  </div>
                  {role && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        role === "buyer"
                          ? "border border-emerald-400/30 bg-emerald-500/10 text-emerald-300"
                          : "border border-cyan-400/30 bg-cyan-500/10 text-cyan-300"
                      }`}
                    >
                      {role}
                    </span>
                  )}
                </div>
                <Link
                  href="/role"
                  className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
                >
                  Switch Role
                </Link>
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
