import { NextResponse } from "next/server";

import { checkAuthAttempt, clientIp } from "@/lib/growth/authRateLimit";
import {
  GROWTH_SESSION_COOKIE,
  GROWTH_STEP_UP_COOKIE,
  issueSession,
} from "@/lib/growth/authSession";
import { failureStoreFromEnv } from "@/lib/growth/authExchange";

export const runtime = "nodejs";

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge,
  };
}

function unavailable(): Response {
  return NextResponse.json({ success: false, error: "認証サービスを利用できません。" }, { status: 503 });
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("x-growth-request") !== "1") {
    return NextResponse.json({ success: false, error: "不正なリクエストです。" }, { status: 400 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "不正なリクエストです。" }, { status: 400 });
  }
  const passphrase = (body as { passphrase?: unknown })?.passphrase;
  if (typeof passphrase !== "string" || !passphrase) {
    return NextResponse.json({ success: false, error: "合言葉を入力してください。" }, { status: 400 });
  }
  const expected = process.env.APPROVE_SECRET ?? "";
  const signingKey = process.env.APPROVE_SESSION_SECRET ?? "";
  const resolved = failureStoreFromEnv();
  if (!expected || !signingKey || resolved.status === "unavailable") return unavailable();
  const attempt = await checkAuthAttempt({
    expected,
    supplied: passphrase,
    ip: clientIp(request),
    hmacKey: signingKey,
    store: resolved.store,
  });
  if (attempt.status === "unavailable") return unavailable();
  if (attempt.status === "limited") {
    return NextResponse.json(
      { success: false, error: "入力回数が上限に達しました。しばらく待ってください。" },
      { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } }
    );
  }
  if (attempt.status === "invalid") {
    return NextResponse.json({ success: false, error: "合言葉が違います。" }, { status: 401 });
  }
  const issued = issueSession(signingKey);
  const response = NextResponse.json({ success: true, expiresAt: issued.payload.expiresAt });
  response.cookies.set(issued.cookieName, issued.token, cookieOptions(issued.maxAge));
  return response;
}

export async function DELETE(request: Request): Promise<Response> {
  if (request.headers.get("x-growth-request") !== "1") {
    return NextResponse.json({ success: false, error: "不正なリクエストです。" }, { status: 400 });
  }
  const response = NextResponse.json({ success: true });
  for (const name of [GROWTH_SESSION_COOKIE, ...Object.values(GROWTH_STEP_UP_COOKIE)]) {
    response.cookies.set(name, "", cookieOptions(0));
  }
  return response;
}
