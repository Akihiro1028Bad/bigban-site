/**
 * 下書きライブプレビュー(#100)の親フレーム ⇄ iframe 間 postMessage 規約。
 *
 * 純ロジックのみ(DOM 非依存)。iframe / contentWindow への薄い結線は
 * DraftPreviewFrame.tsx(送信側) と DraftFrameClient.tsx(受信側) に置く。
 */

// postMessage の識別子。他の message と取り違えないための固定タグ。
export const PREVIEW_MESSAGE_TYPE = "growth-draft-preview";

// 受信を許容する本文 HTML の最大長(文字数)。下書き本文の現実的上限を十分上回る値。
// 巨大メッセージによる過負荷を弾く防御。
export const MAX_PREVIEW_HTML_LENGTH = 500_000;

export interface PreviewMessage {
  type: typeof PREVIEW_MESSAGE_TYPE;
  html: string;
}

/** 親 → iframe へ送る本文 HTML メッセージを組み立てる。 */
export function buildPreviewMessage(html: string): PreviewMessage {
  return { type: PREVIEW_MESSAGE_TYPE, html };
}

/** postMessage の origin が自オリジンと一致する時のみ受理する。 */
export function isAllowedPreviewOrigin(
  origin: string,
  selfOrigin: string,
): boolean {
  return origin === selfOrigin;
}

/**
 * 受信した message data を検証し、正規の PreviewMessage のみ返す。
 * 形が不正 / type 不一致 / html が文字列でない / 長すぎる 場合は null。
 */
export function parsePreviewMessage(data: unknown): PreviewMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (record.type !== PREVIEW_MESSAGE_TYPE) return null;
  if (typeof record.html !== "string") return null;
  if (record.html.length > MAX_PREVIEW_HTML_LENGTH) return null;
  return { type: PREVIEW_MESSAGE_TYPE, html: record.html };
}
