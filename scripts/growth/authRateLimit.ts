import { createHmac } from "node:crypto";

import { safeEqual } from "../../src/lib/growth/apiAuth";

const WINDOW_MS = 15 * 60 * 1_000;
const MAX_FAILURES = 5;

export interface FailureCount {
  count: number;
  resetAt: number;
}

export interface FailureStore {
  failureCount(key: string, nowMs: number): Promise<FailureCount>;
  incrementFailure(key: string, nowMs: number, windowMs: number): Promise<FailureCount>;
}

type MemoryEntry = FailureCount;

export class InMemoryFailureStore implements FailureStore {
  private readonly entries = new Map<string, MemoryEntry>();

  async failureCount(key: string, nowMs: number): Promise<FailureCount> {
    const current = this.entries.get(key);
    if (!current || current.resetAt <= nowMs) {
      if (current) this.entries.delete(key);
      return { count: 0, resetAt: nowMs };
    }
    return { ...current };
  }

  async incrementFailure(key: string, nowMs: number, windowMs: number): Promise<FailureCount> {
    const current = this.entries.get(key);
    if (!current || current.resetAt <= nowMs) {
      const next = { count: 1, resetAt: nowMs + windowMs };
      this.entries.set(key, next);
      return next;
    }
    current.count += 1;
    return { ...current };
  }
}

export function clientIp(request: Request): string {
  const raw =
    request.headers.get("x-vercel-forwarded-for") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  return raw.split(",")[0]?.trim() || "unknown";
}

export function hashClientIp(ip: string, hmacKey: string): string {
  return createHmac("sha256", hmacKey).update(ip).digest("hex");
}

export type AuthAttemptResult =
  | { status: "valid" }
  | { status: "invalid" }
  | { status: "limited"; retryAfterSeconds: number }
  | { status: "unavailable" };

interface CheckAuthAttemptInput {
  expected: string;
  supplied: string;
  ip: string;
  hmacKey: string;
  store: FailureStore;
  nowMs?: number;
}

export async function checkAuthAttempt(input: CheckAuthAttemptInput): Promise<AuthAttemptResult> {
  const nowMs = input.nowMs ?? Date.now();
  const key = hashClientIp(input.ip, input.hmacKey);
  try {
    const current = await input.store.failureCount(key, nowMs);
    if (current.count >= MAX_FAILURES) {
      return {
        status: "limited",
        retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - nowMs) / 1_000)),
      };
    }
  } catch {
    return { status: "unavailable" };
  }
  if (Boolean(input.expected) && safeEqual(input.supplied, input.expected)) {
    return { status: "valid" };
  }
  try {
    const result = await input.store.incrementFailure(key, nowMs, WINDOW_MS);
    return result.count > MAX_FAILURES
      ? {
          status: "limited",
          retryAfterSeconds: Math.max(1, Math.ceil((result.resetAt - nowMs) / 1_000)),
        }
      : { status: "invalid" };
  } catch {
    return { status: "unavailable" };
  }
}

declare global {
  var __growthAuthFailureStore: InMemoryFailureStore | undefined;
}

export function localFailureStore(): InMemoryFailureStore {
  globalThis.__growthAuthFailureStore ??= new InMemoryFailureStore();
  return globalThis.__growthAuthFailureStore;
}
