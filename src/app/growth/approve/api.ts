/**
 * 承認画面のサーバ通信(#H7)。ApproveClient から fetch ロジックを切り出し、
 * React Query の queryFn / mutationFn から呼べる純粋な I/O 関数にする。
 * 認証は Authorization ヘッダ方式(authHeaders)を維持し、?token= クエリには戻さない。
 */

import type { PendingItem } from "@/lib/growth/approve";
import { readJsonObject } from "@/lib/growth/safeJson";

import { authHeaders } from "./authHeaders";

export const BOARD_URL = "/api/growth/approve";

/**
 * 承認待ち一覧を取得する。失敗時は表示用メッセージを持つ Error を投げる
 * (ApproveClient.fetchPending と同一挙動: 401 は合言葉エラー、その他は error 文言)。
 */
export async function fetchBoard(token: string): Promise<PendingItem[]> {
  const res = await fetch(BOARD_URL, { headers: authHeaders(token) });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    throw new Error(
      res.status === 401
        ? "合言葉が違います。LINE グループでお知らせした合言葉をご確認ください。"
        : json.error ?? "取得に失敗しました。"
    );
  }
  return json.items as PendingItem[];
}

/** 承認/却下/クローズ/承認待ち復帰: ステータスを1件更新する。失敗時は表示用 Error を投げる。 */
export async function postDecision(token: string, id: string, decision: string): Promise<void> {
  const res = await fetch(BOARD_URL, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ decisions: [{ id, decision }] }),
  });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "保存に失敗しました。");
  }
}

/** 記事を公開する。失敗時は表示用 Error を投げる。 */
export async function postPublish(token: string, pageId: string): Promise<void> {
  const res = await fetch("/api/growth/publish", {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify({ pageId }),
  });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "公開に失敗しました。");
  }
}
