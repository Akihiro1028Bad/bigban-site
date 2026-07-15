import { NextResponse } from "next/server";

import { authenticatedSession, unauthorized } from "@/lib/growth/apiAuth";
import { checkAuthAttempt, clientIp } from "@/lib/growth/authRateLimit";
import { issueStepUp, type StepUpScope } from "@/lib/growth/authSession";
import { failureStoreFromEnv } from "@/lib/growth/authExchange";

export const runtime = "nodejs";

function isScope(value: unknown): value is StepUpScope {
  return value === "publish" || value === "media";
}

export async function POST(request: Request): Promise<Response> {
  const session = authenticatedSession(request);
  if (!session) return unauthorized();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "不正なリクエストです。" }, { status: 400 });
  }
  const passphrase = (body as { passphrase?: unknown })?.passphrase;
  const scope = (body as { scope?: unknown })?.scope;
  if (typeof passphrase !== "string" || !passphrase || !isScope(scope)) {
    return NextResponse.json({ success: false, error: "入力内容が不正です。" }, { status: 400 });
  }
  const expected = process.env.APPROVE_SECRET ?? "";
  const signingKey = process.env.APPROVE_SESSION_SECRET!;
  const resolved = failureStoreFromEnv();
  if (!expected || resolved.status === "unavailable") {
    return NextResponse.json({ success: false, error: "認証サービスを利用できません。" }, { status: 503 });
  }
  const attempt = await checkAuthAttempt({
    expected,
    supplied: passphrase,
    ip: clientIp(request),
    hmacKey: signingKey,
    store: resolved.store,
  });
  if (attempt.status === "unavailable") {
    return NextResponse.json({ success: false, error: "認証サービスを利用できません。" }, { status: 503 });
  }
  if (attempt.status === "limited") {
    return NextResponse.json(
      { success: false, error: "入力回数が上限に達しました。しばらく待ってください。" },
      { status: 429, headers: { "Retry-After": String(attempt.retryAfterSeconds) } }
    );
  }
  if (attempt.status === "invalid") {
    return NextResponse.json({ success: false, error: "合言葉が違います。" }, { status: 401 });
  }
  const issued = issueStepUp(signingKey, session.sid, scope);
  const response = NextResponse.json({ success: true, expiresAt: issued.payload.expiresAt, scope });
  response.cookies.set(issued.cookieName, issued.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: issued.maxAge,
  });
  return response;
}
