/**
 * LINE Messaging API の push 送信(テキストのみ)。
 *
 * 週次通知をグループへ送る用途。受信(webhook)は使わず push 専用。
 * fetch は注入可能(テスト容易性)。チャネルアクセストークンが必要。
 */

import type { FetchFn } from "./http";

export const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export interface LinePushOptions {
  channelAccessToken: string;
  fetchFn: FetchFn;
}

/** 指定の宛先(グループ/ユーザーID)へテキストメッセージを push する。 */
export async function pushTextMessage(
  to: string,
  text: string,
  options: LinePushOptions
): Promise<void> {
  const res = await options.fetchFn(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages: [{ type: "text", text }] }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE push に失敗しました (HTTP ${res.status}): ${text}`);
  }
}
