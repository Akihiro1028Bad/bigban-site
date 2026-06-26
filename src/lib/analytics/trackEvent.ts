/**
 * CTA クリックの GA4 イベント送信(#計測強化 S1)。
 *
 * `@next/third-parties/google` の `sendGAEvent` で dataLayer へ送る薄い I/O。
 * `<GoogleAnalytics/>` は本番(VERCEL_ENV=production)のみ描画されるため、それ以外
 * (ローカル/Preview/SSR)では gtag 未初期化。その状態で `sendGAEvent` を呼ぶと
 * ライブラリが console.warn して**送信せず破棄**する。これを避けるため、ここで
 * gtag 初期化済み(かつ window 有り)のときだけ送信する(=本番だけ実送信・SSR安全)。
 * 純ロジック(イベント名・パラメータ整形)は events.ts でテスト済みのため本ファイルは
 * カバレッジ対象外(vitest.config.ts の exclude)。
 */

"use client";

import { sendGAEvent } from "@next/third-parties/google";

import { CTA_EVENTS, ctaEventParams, type CtaKey } from "./events";

/** GoogleAnalytics(gtag.js)が初期化済みか。未初期化(非本番/SSR)では送らない。 */
function isGaReady(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as { gtag?: unknown }).gtag === "function"
  );
}

/** CTA クリックを GA4 へ送る。key=CTA種別、location=設置箇所、label=任意の補助ラベル。 */
export function trackCtaClick(key: CtaKey, location: string, label?: string): void {
  if (!isGaReady()) return;
  sendGAEvent("event", CTA_EVENTS[key], ctaEventParams(location, label));
}
