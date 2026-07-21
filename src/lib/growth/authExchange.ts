import {
  InMemoryFailureStore,
  type FailureCount,
  type FailureStore,
} from "@/lib/growth/authRateLimit";

const WINDOW_MS = 15 * 60 * 1_000;

export class UpstashFailureStore implements FailureStore {
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async failureCount(key: string, nowMs: number): Promise<FailureCount> {
    return this.execute(
      "local n=tonumber(redis.call('GET',KEYS[1]) or '0'); return {n,redis.call('PTTL',KEYS[1])}",
      key,
      [],
      nowMs,
    );
  }

  async incrementFailure(key: string, nowMs: number, windowMs: number): Promise<FailureCount> {
    const script =
      "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}";
    return this.execute(script, key, [String(windowMs)], nowMs);
  }

  private async execute(
    script: string,
    key: string,
    args: readonly string[],
    nowMs: number,
  ): Promise<FailureCount> {
    const response = await this.fetchFn(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", script, "1", key, ...args]),
    });
    if (!response.ok) throw new Error("rate limit backend unavailable");
    const body: unknown = await response.json();
    const result =
      body !== null && typeof body === "object" ? (body as { result?: unknown }).result : undefined;
    if (
      !Array.isArray(result) ||
      typeof result[0] !== "number" ||
      typeof result[1] !== "number"
    ) {
      throw new Error("invalid rate limit response");
    }
    return { count: result[0], resetAt: nowMs + Math.max(1, result[1]) };
  }
}

export type FailureStoreResolution =
  | { status: "ready"; store: FailureStore }
  | { status: "unavailable" };

export function failureStoreFromEnv(): FailureStoreResolution {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (process.env.NODE_ENV === "production") {
    return url && token
      ? { status: "ready", store: new UpstashFailureStore(url, token) }
      : { status: "unavailable" };
  }
  globalThis.__growthAuthFailureStore ??= new InMemoryFailureStore();
  return { status: "ready", store: globalThis.__growthAuthFailureStore };
}

export const AUTH_RATE_WINDOW_MS = WINDOW_MS;
