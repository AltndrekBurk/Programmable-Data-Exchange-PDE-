const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Base fetch wrapper for unauthenticated endpoints (e.g. GET /api/marketplace).
 * Throws an Error with the API error message on non-2xx responses.
 */
export async function apiFetch<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number }
): Promise<T> {
  const { timeoutMs = 15_000, ...fetchOptions } = options ?? {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
      },
      signal: controller.signal,
      ...fetchOptions,
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(
        error.error || error.message || `API error: ${res.status}`
      );
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      throw new Error("Server did not respond (timeout)");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Authenticated fetch: reads the NextAuth session cookie automatically
 * (cookie is forwarded by the browser). For server-to-server calls, pass
 * an explicit Authorization Bearer token via options.headers.
 *
 * Usage (client components):
 *   apiFetchAuthed<SkillListResponse>("/api/skills")
 *
 * Usage with explicit token (e.g. server actions):
 *   apiFetchAuthed<SkillListResponse>("/api/skills", {}, token)
 */
export async function apiFetchAuthed<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number },
  bearerToken?: string
): Promise<T> {
  const authHeaders: Record<string, string> = bearerToken
    ? { Authorization: `Bearer ${bearerToken}` }
    : {};

  return apiFetch<T>(path, {
    credentials: "include",
    ...options,
    headers: {
      ...authHeaders,
      ...options?.headers,
    },
  });
}
