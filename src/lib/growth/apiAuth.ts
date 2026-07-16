import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";
import {
  GROWTH_SESSION_COOKIE,
  GROWTH_STEP_UP_COOKIE,
  verifySession,
  verifyStepUp,
  type SessionPayload,
  type StepUpScope,
} from "@/lib/growth/authSession";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function cookieValue(request: Request, name: string): string {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) {
      try {
        return decodeURIComponent(rest.join("="));
      } catch {
        return "";
      }
    }
  }
  return "";
}

function hasLegacyCredential(request: Request): boolean {
  return request.headers.has("authorization") || new URL(request.url).searchParams.has("token");
}

function hasCsrfHeader(request: Request): boolean {
  return ["GET", "HEAD", "OPTIONS"].includes(request.method)
    ? true
    : request.headers.get("x-growth-request") === "1";
}

export function authenticatedSession(request: Request): SessionPayload | null {
  if (hasLegacyCredential(request) || !hasCsrfHeader(request)) return null;
  const key = process.env.APPROVE_SESSION_SECRET ?? "";
  if (!key) return null;
  return verifySession(cookieValue(request, GROWTH_SESSION_COOKIE), key);
}

export function verifyToken(request: Request, denyWhenDisabled = false): boolean {
  if (hasLegacyCredential(request)) return false;
  if (!APPROVE_AUTH_ENABLED) return !denyWhenDisabled;
  return authenticatedSession(request) !== null;
}

export type PrivilegedAuthResult = "authorized" | "unauthorized" | "step-up-required";

export function verifyPrivileged(request: Request, scope: StepUpScope): PrivilegedAuthResult {
  if (!APPROVE_AUTH_ENABLED || hasLegacyCredential(request)) return "unauthorized";
  const session = authenticatedSession(request);
  if (!session) return "unauthorized";
  const key = process.env.APPROVE_SESSION_SECRET!;
  const token = cookieValue(request, GROWTH_STEP_UP_COOKIE[scope]);
  return verifyStepUp(token, key, scope, session.sid) ? "authorized" : "step-up-required";
}

export function unauthorized(message = "認証に失敗しました"): Response {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}

export function stepUpRequired(scope: StepUpScope): Response {
  return NextResponse.json(
    { success: false, error: "再認証が必要です。", code: "STEP_UP_REQUIRED", scope },
    { status: 403 }
  );
}

export function privilegedAuthFailure(
  result: Exclude<PrivilegedAuthResult, "authorized">,
  scope: StepUpScope,
  unauthorizedMessage: string
): Response {
  return result === "unauthorized" ? unauthorized(unauthorizedMessage) : stepUpRequired(scope);
}
