/**
 * 下書きライブプレビュー(#100)の親フレーム ⇄ iframe 間 postMessage 規約。
 *
 * 純ロジックのみ(DOM 非依存)。iframe / contentWindow への薄い結線は
 * DraftPreviewFrame.tsx(送信側) と DraftFrameClient.tsx(受信側) に置く。
 */

// postMessage の識別子。他の message と取り違えないための固定タグ。
export const PREVIEW_MESSAGE_TYPE = "growth-draft-preview";

// iframe(子) → 親 へ「message リスナー登録済み・送信して良い」を伝える handshake タグ。
// 親の onLoad 起点の単発送信は、子の useEffect リスナー登録が間に合わず取りこぼす
// レースがあった(#F2)。子が ready を送ってから親が本文を post することで、
// タイミングに依存せず確実に本文が届く。
export const DRAFT_READY_MESSAGE_TYPE = "growth-draft-ready";

// 受信を許容する本文 HTML の最大長(文字数)。下書き本文の現実的上限を十分上回る値。
// 巨大メッセージによる過負荷を弾く防御。
export const MAX_PREVIEW_HTML_LENGTH = 500_000;

export interface PreviewMessage {
  type: typeof PREVIEW_MESSAGE_TYPE;
  html: string;
}

export interface DraftReadyMessage {
  type: typeof DRAFT_READY_MESSAGE_TYPE;
}

/** 親 → iframe へ送る本文 HTML メッセージを組み立てる。 */
export function buildPreviewMessage(html: string): PreviewMessage {
  return { type: PREVIEW_MESSAGE_TYPE, html };
}

/** iframe → 親 へ送る ready(受信準備完了)メッセージを組み立てる。 */
export function buildDraftReadyMessage(): DraftReadyMessage {
  return { type: DRAFT_READY_MESSAGE_TYPE };
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

/**
 * 受信した message data が正規の ready メッセージか判定する。
 * 形が不正 / type 不一致 の場合は false(型ガード)。
 */
export function isDraftReadyMessage(data: unknown): data is DraftReadyMessage {
  if (typeof data !== "object" || data === null) return false;
  const record = data as Record<string, unknown>;
  return record.type === DRAFT_READY_MESSAGE_TYPE;
}
