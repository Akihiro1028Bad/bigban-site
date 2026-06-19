/**
 * LINE Messaging API の push 送信(テキスト / Flex)。
 *
 * 週次通知をグループへ送る用途。受信(webhook)は使わず push 専用。
 * fetch は注入可能(テスト容易性)。チャネルアクセストークンが必要。
 */

import type { FlexContainer } from "./digest-flex";
import type { FetchFn } from "./http";

export const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export interface LinePushOptions {
  channelAccessToken: string;
  fetchFn: FetchFn;
}

/** push エンドポイントへ messages 配列を送る共通処理。失敗時は throw。 */
async function pushMessages(
  to: string,
  messages: unknown[],
  options: LinePushOptions
): Promise<void> {
  const res = await options.fetchFn(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ to, messages }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE push に失敗しました (HTTP ${res.status}): ${text}`);
  }
}

/** 指定の宛先(グループ/ユーザーID)へテキストメッセージを push する。 */
export async function pushTextMessage(
  to: string,
  text: string,
  options: LinePushOptions
): Promise<void> {
  await pushMessages(to, [{ type: "text", text }], options);
}

/**
 * Flex Message(単一バブル or カルーセル)を push する。
 * Flex 非対応環境向けに altText を必ず付ける。
 */
export async function pushFlexMessage(
  to: string,
  altText: string,
  contents: FlexContainer,
  options: LinePushOptions
): Promise<void> {
  await pushMessages(to, [{ type: "flex", altText, contents }], options);
}
