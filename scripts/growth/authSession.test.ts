// @vitest-environment node
import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  GROWTH_SESSION_COOKIE,
  GROWTH_STEP_UP_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  STEP_UP_MAX_AGE_SECONDS,
  issueSession,
  issueStepUp,
  verifySession,
  verifyStepUp,
} from "./authSession";

const KEY = "a-signing-key-that-is-long-and-distinct";
const NOW = 1_700_000_000_000;

describe("authSession", () => {
  function signed(payload: unknown): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${encoded}.${createHmac("sha256", KEY).update(encoded).digest("base64url")}`;
  }
  it("通常sessionを署名し30分の絶対期限で検証する", () => {
    const issued = issueSession(KEY, { nowMs: NOW, sid: "sid-1" });
    expect(issued.cookieName).toBe(GROWTH_SESSION_COOKIE);
    expect(issued.maxAge).toBe(SESSION_MAX_AGE_SECONDS);
    expect(verifySession(issued.token, KEY, NOW + 1_000)).toMatchObject({
      kind: "session",
      sid: "sid-1",
      scope: null,
      issuedAt: NOW,
      expiresAt: NOW + SESSION_MAX_AGE_SECONDS * 1_000,
    });
    expect(verifySession(issued.token, KEY, NOW + SESSION_MAX_AGE_SECONDS * 1_000)).toBeNull();
  });

  it("改ざん・別キー・不正payload・不正kindを拒否する", () => {
    const issued = issueSession(KEY, { nowMs: NOW, sid: "sid-1" });
    expect(verifySession(`${issued.token}x`, KEY, NOW)).toBeNull();
    expect(verifySession(issued.token, "wrong-key", NOW)).toBeNull();
    expect(verifySession("not-a-token", KEY, NOW)).toBeNull();
    expect(verifySession(`${issued.token}.extra`, KEY, NOW)).toBeNull();
    const invalidJson = Buffer.from("{").toString("base64url");
    expect(
      verifySession(`${invalidJson}.${createHmac("sha256", KEY).update(invalidJson).digest("base64url")}`, KEY, NOW)
    ).toBeNull();
    const stepUp = issueStepUp(KEY, "sid-1", "publish", { nowMs: NOW });
    expect(verifySession(stepUp.token, KEY, NOW)).toBeNull();
  });

  it("payload各フィールドの型・version・未来issuedAtを検証する", () => {
    const base = { version: 1, kind: "session", sid: "s", scope: null, issuedAt: NOW, expiresAt: NOW + 1 };
    const invalid = [
      null,
      { ...base, version: 2 },
      { ...base, kind: "other" },
      { ...base, sid: 1 },
      { ...base, scope: "admin" },
      { ...base, issuedAt: "now" },
      { ...base, expiresAt: "later" },
      { ...base, issuedAt: NOW + 1 },
    ];
    invalid.forEach((payload) => expect(verifySession(signed(payload), KEY, NOW)).toBeNull());
  });

  it("step-upは5分・単一scopeで親sid一致を要求する", () => {
    const issued = issueStepUp(KEY, "sid-1", "publish", { nowMs: NOW });
    expect(issued.cookieName).toBe(GROWTH_STEP_UP_COOKIE.publish);
    expect(issued.maxAge).toBe(STEP_UP_MAX_AGE_SECONDS);
    expect(verifyStepUp(issued.token, KEY, "publish", "sid-1", NOW)).not.toBeNull();
    expect(verifyStepUp(issued.token, KEY, "media", "sid-1", NOW)).toBeNull();
    expect(verifyStepUp(issued.token, KEY, "publish", "sid-2", NOW)).toBeNull();
    expect(verifyStepUp(issued.token, KEY, "publish", "sid-1", NOW + 300_000)).toBeNull();
  });
});
