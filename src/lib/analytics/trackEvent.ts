/**
 * CTA クリックの GA4 イベント送信(#計測強化 S1)。
 *
 * `@next/third-parties/google` の `sendGAEvent` で dataLayer へ送る薄い I/O。
 * 親に `<GoogleAnalytics/>`(本番のみ描画)があるときだけ実送信され、未ロード時は
 * dataLayer に積まれるだけで害は無い(SSR では呼ばれない=クリックハンドラ専用)。
 * 純ロジック(イベント名・パラメータ整形)は events.ts でテスト済みのため本ファイルは
 * カバレッジ対象外(vitest.config.ts の exclude)。
 */

"use client";

import { sendGAEvent } from "@next/third-parties/google";

import { CTA_EVENTS, ctaEventParams, type CtaKey } from "./events";

/** CTA クリックを GA4 へ送る。key=CTA種別、location=設置箇所、label=任意の補助ラベル。 */
export function trackCtaClick(key: CtaKey, location: string, label?: string): void {
  sendGAEvent("event", CTA_EVENTS[key], ctaEventParams(location, label));
}
