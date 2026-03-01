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

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      apiFetch<DashboardData>("/api/skills")
        .then((data) => setSkills(data.skills || []))
        .catch(() => setSkills([]))
        .finally(() => setLoading(false));
    }
  }, [status]);

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
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hosgeldin,{" "}
            <span className="font-mono">
              {session?.user?.pseudoId?.slice(0, 8)}
            </span>
          </p>
        </div>
        <Link
          href="/skills/create"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Yeni Veri Talebi
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
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
      </div>

      {/* Skills/Tasks */}
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
                Marketplace'e goz at
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
