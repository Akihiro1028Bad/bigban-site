/**
 * LINE Messaging API の push 送信(テキスト / Flex)。
 *
 * 週次通知をグループへ送る用途。受信(webhook)は使わず push 専用。
 * fetch は注入可能(テスト容易性)。チャネルアクセストークンが必要。
 */

import type { FlexContainer } from "./digest-flex";
import type { FetchFn } from "./http";
import { externalApiErrorFromResponse } from "./externalApiError";
import { sanitizeLinePayload } from "./lineRedaction";
import { resolveNotifyLevel, shouldPushLine } from "./notifyGate";
import type { NotifyKind } from "./notifyGate";

export const LINE_PUSH_URL = "https://api.line.me/v2/bot/message/push";

export interface LinePushOptions {
  channelAccessToken: string;
  fetchFn: FetchFn;
  kind?: NotifyKind;
}

/** push エンドポイントへ messages 配列を送る共通処理。失敗時は throw。 */
async function pushMessages(
  to: string,
  messages: unknown[],
  options: LinePushOptions
): Promise<void> {
  const kind = options.kind ?? "routine";
  if (!shouldPushLine(kind, resolveNotifyLevel(process.env))) return;

  const res = await options.fetchFn(LINE_PUSH_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.channelAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      sanitizeLinePayload(
        { to, messages },
        {
          secrets: [
            process.env.APPROVE_SECRET ?? "",
            process.env.MICROCMS_API_KEY ?? "",
            process.env.MICROCMS_MANAGEMENT_API_KEY ?? "",
            options.channelAccessToken,
          ],
        }
      )
    ),
  });

  if (!res.ok) {
    throw externalApiErrorFromResponse("line.push", res);
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
