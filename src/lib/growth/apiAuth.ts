/**
 * 承認画面 API 共通の認証(#H6 / #H27 / #SEC-11 / #SEC-03)。
 *
 * 全 api/growth/* ルートが import し、トークン検証の重複(約20ファイル)と実装ブレを解消する。
 * - トークンは `Authorization: Bearer <token>` ヘッダで受け取る(#SEC-03: URL/クエリに載せない)。
 * - 比較は sha256 ダイジェストの定数時間比較で、**長さ差もタイミングに漏らさない**(#H27)。
 * - 認証ゲートは Phase 0 の `APPROVE_AUTH_ENABLED`(env駆動・既定ON)を踏襲。
 */

import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * 定数時間の文字列一致判定。sha256 ダイジェスト(常に32バイト)同士を timingSafeEqual で比較するため、
 * 長さの違いを早期 return で漏らさない(#H27 タイミングリーク修正)。
 */
export function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

/** `Authorization: Bearer <token>` からトークンを取り出す。無ければ空文字。 */
export function bearerToken(request: Request): string {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
}

/**
 * トークンを取り出す。**Authorization: Bearer ヘッダを優先**する(#SEC-03: 承認画面の新クライアントは
 * トークンを URL に載せずヘッダで送る)。`?token=` クエリは**非推奨の後方互換**として受理するのみで、
 * 新クライアントは送らない(URL露出=ログ/Referer/履歴 漏れを防ぐ)。
 */
function tokenFrom(request: Request): string {
  const header = bearerToken(request);
  if (header) return header;
  return new URL(request.url).searchParams.get("token") ?? "";
}

/**
 * トークン検証。認証無効(APPROVE_AUTH_ENABLED=false)時の既定挙動は denyWhenDisabled で分岐:
 * - false(既定): 検証をスキップして許可(承認/編集など通常 API)。
 * - true: 認証無効でも常に拒否(公開など最強権限 API)。
 */
export function verifyToken(request: Request, denyWhenDisabled = false): boolean {
  if (!APPROVE_AUTH_ENABLED) return !denyWhenDisabled;
  const expected = process.env.APPROVE_SECRET ?? "";
  return Boolean(expected) && safeEqual(tokenFrom(request), expected);
}

/** 401 レスポンス(JSON 本文必須=client の res.json() を壊さない)。 */
export function unauthorized(message = "認証に失敗しました"): Response {
  return NextResponse.json({ success: false, error: message }, { status: 401 });
}
