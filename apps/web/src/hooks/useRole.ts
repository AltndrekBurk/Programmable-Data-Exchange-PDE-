"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

export type Role = "buyer" | "seller";

const STORAGE_KEY = "pde_user_role";

export function useRole() {
  const { data: session } = useSession();
  const [role, setRoleState] = useState<Role | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Role | null;
    if (stored === "buyer" || stored === "seller") {
      setRoleState(stored);
    }
    setIsLoading(false);
  }, []);

  const setRole = (newRole: Role) => {
    localStorage.setItem(STORAGE_KEY, newRole);
    setRoleState(newRole);
  };

  const clearRole = () => {
    localStorage.removeItem(STORAGE_KEY);
    setRoleState(null);
  };

  return {
    role,
    setRole,
    clearRole,
    isLoading,
    stellarAddress: session?.user?.stellarAddress ?? null,
  };
}
