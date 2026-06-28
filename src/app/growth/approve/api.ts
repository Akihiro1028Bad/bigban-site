/**
 * 承認画面のサーバ通信(#H7)。ApproveClient から fetch ロジックを切り出し、
 * React Query の queryFn / mutationFn から呼べる純粋な I/O 関数にする。
 * 認証は Authorization ヘッダ方式(authHeaders)を維持し、?token= クエリには戻さない。
 */

import type { PendingItem } from "@/lib/growth/approve";
import type { PromptGroup } from "@/lib/growth/promptRegistry";
import { readJsonObject } from "@/lib/growth/safeJson";

import { authHeaders } from "./authHeaders";

export const BOARD_URL = "/api/growth/approve";

export const PROMPTS_URL = "/api/growth/prompts";

/** プロンプト確認タブのデータ(前提情報の生テキスト＋フェーズ群)。 */
export interface PromptsData {
  facilityContext: string | null;
  groups: PromptGroup[];
}

/**
 * 各フェーズのプロンプトと前提情報(facility-context)を取得する。read-only。
 * 失敗時は表示用メッセージを持つ Error を投げる(401 は合言葉エラー、その他は error 文言)。
 */
export async function fetchPrompts(token: string): Promise<PromptsData> {
  const res = await fetch(PROMPTS_URL, { headers: authHeaders(token) });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    throw new Error(
      res.status === 401
        ? "合言葉が違います。LINE グループでお知らせした合言葉をご確認ください。"
        : json.error ?? "取得に失敗しました。"
    );
  }
  return {
    facilityContext: (json.facilityContext as string | null) ?? null,
    groups: (json.groups as PromptGroup[]) ?? [],
  };
}

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

async function postJson(token: string, url: string, body: unknown): Promise<{ status: number; ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: authHeaders(token, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  const json = await readJsonObject(res);
  return { status: res.status, ok: res.ok && json.success === true, error: json.error };
}

export interface ReviseRequest {
  pageId: string;
  comments: { line: string; comment: string }[];
  titleInstruction?: string;
}

/** 構成案/タイトルの AI 修正を依頼する。409 は処理中メッセージ。 */
export async function postRevise(token: string, body: ReviseRequest): Promise<void> {
  const res = await postJson(token, "/api/growth/revise", body);
  if (!res.ok) {
    throw new Error(
      res.status === 409
        ? "この記事は修正処理中です。完了までお待ちください。"
        : res.error ?? "修正依頼に失敗しました。"
    );
  }
}

/** 構成案/タイトルを直接上書き保存する(手動編集)。409 は AI 修正処理中メッセージ。 */
export async function postReviseEdit(
  token: string,
  pageId: string,
  payload: { outline?: string; title?: string }
): Promise<void> {
  const res = await postJson(token, "/api/growth/revise/edit", { pageId, ...payload });
  if (!res.ok) {
    throw new Error(
      res.status === 409
        ? "この記事はAI修正処理中です。完了後に編集してください。"
        : res.error ?? "保存に失敗しました。"
    );
  }
}

/** 提示中の修正案を反映/破棄する。 */
export async function postReviseApply(
  token: string,
  pageId: string,
  action: "apply" | "discard"
): Promise<void> {
  const res = await postJson(token, "/api/growth/revise/apply", { pageId, action });
  if (!res.ok) {
    throw new Error(res.error ?? "更新に失敗しました。");
  }
}
