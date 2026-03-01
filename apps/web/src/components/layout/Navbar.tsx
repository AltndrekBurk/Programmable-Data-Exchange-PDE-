"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/marketplace", label: "Marketplace" },
  { href: "/skills/create", label: "Veri Talep Et" },
  { href: "/tasks", label: "Gorevler" },
  { href: "/escrow", label: "Escrow" },
  { href: "/proofs", label: "Proofs" },
  { href: "/provider", label: "Saglayici Ol" },
];

export default function Navbar() {
  const { data: session, status } = useSession();
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-8">
            <Link href="/" className="text-xl font-bold text-gray-900">
              dataEconomy
            </Link>
            {status === "authenticated" && (
              <div className="hidden md:flex items-center gap-1">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === link.href || pathname?.startsWith(link.href + "/")
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
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
                  <span className="text-gray-500 font-mono">
                    {session.user.stellarAddress?.slice(0, 6)}...
                    {session.user.stellarAddress?.slice(-4)}
                  </span>
                  <span className="text-gray-400">
                    {session.user.pseudoId?.slice(0, 8)}
                  </span>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Cikis
                </button>
              </>
            ) : status === "unauthenticated" ? (
              <Link
                href="/login"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                Giris Yap
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  );
}
