import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export type StepUpScope = "publish" | "media";
export type SessionKind = "session" | "step-up";

export interface SessionPayload {
  version: 1;
  kind: SessionKind;
  sid: string;
  scope: StepUpScope | null;
  issuedAt: number;
  expiresAt: number;
}

export const SESSION_MAX_AGE_SECONDS = 30 * 60;
export const STEP_UP_MAX_AGE_SECONDS = 5 * 60;
export const GROWTH_SESSION_COOKIE = "growth_session";
export const GROWTH_STEP_UP_COOKIE: Record<StepUpScope, string> = {
  publish: "growth_step_up_publish",
  media: "growth_step_up_media",
};

interface IssueOptions {
  nowMs?: number;
  sid?: string;
}

export interface IssuedSession {
  token: string;
  payload: SessionPayload;
  cookieName: string;
  maxAge: number;
}

function encode(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function sign(encodedPayload: string, key: string): string {
  return createHmac("sha256", key).update(encodedPayload).digest("base64url");
}

function tokenFor(payload: SessionPayload, key: string): string {
  const encoded = encode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, key)}`;
}

function isScope(value: unknown): value is StepUpScope {
  return value === "publish" || value === "media";
}

function isPayload(value: unknown): value is SessionPayload {
  if (value === null || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.version === 1 &&
    (item.kind === "session" || item.kind === "step-up") &&
    typeof item.sid === "string" &&
    (item.scope === null || isScope(item.scope)) &&
    typeof item.issuedAt === "number" &&
    typeof item.expiresAt === "number"
  );
}

function parseToken(token: string, key: string, nowMs: number): SessionPayload | null {
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra !== undefined) return null;
  const expectedSignature = sign(encoded, key);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (!isPayload(parsed) || parsed.expiresAt <= nowMs || parsed.issuedAt > nowMs) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function issueSession(key: string, options: IssueOptions = {}): IssuedSession {
  const nowMs = options.nowMs ?? Date.now();
  const payload: SessionPayload = {
    version: 1,
    kind: "session",
    sid: options.sid ?? randomUUID(),
    scope: null,
    issuedAt: nowMs,
    expiresAt: nowMs + SESSION_MAX_AGE_SECONDS * 1_000,
  };
  return {
    token: tokenFor(payload, key),
    payload,
    cookieName: GROWTH_SESSION_COOKIE,
    maxAge: SESSION_MAX_AGE_SECONDS,
  };
}

export function issueStepUp(
  key: string,
  sid: string,
  scope: StepUpScope,
  options: Omit<IssueOptions, "sid"> = {}
): IssuedSession {
  const nowMs = options.nowMs ?? Date.now();
  const payload: SessionPayload = {
    version: 1,
    kind: "step-up",
    sid,
    scope,
    issuedAt: nowMs,
    expiresAt: nowMs + STEP_UP_MAX_AGE_SECONDS * 1_000,
  };
  return {
    token: tokenFor(payload, key),
    payload,
    cookieName: GROWTH_STEP_UP_COOKIE[scope],
    maxAge: STEP_UP_MAX_AGE_SECONDS,
  };
}

export function verifySession(token: string, key: string, nowMs = Date.now()): SessionPayload | null {
  const payload = parseToken(token, key, nowMs);
  return payload?.kind === "session" && payload.scope === null ? payload : null;
}

export function verifyStepUp(
  token: string,
  key: string,
  scope: StepUpScope,
  parentSid: string,
  nowMs = Date.now()
): SessionPayload | null {
  const payload = parseToken(token, key, nowMs);
  return payload?.kind === "step-up" && payload.scope === scope && payload.sid === parentSid
    ? payload
    : null;
}
