/**
 * 承認画面のサーバ通信(#H7)。ApproveClient から fetch ロジックを切り出し、
 * React Query の queryFn / mutationFn から呼べる純粋な I/O 関数にする。
 * 認証はHttpOnly Cookieを使い、unsafe requestにはCSRF補強ヘッダを付ける。
 */

import type { PendingItem } from "@/lib/growth/approve";
import type { PromptGroup } from "@/lib/growth/promptRegistry";
import { readJsonObject } from "@/lib/growth/safeJson";
import type { GrowthOpsView } from "@/lib/growth/workerLog";
import type {
  ModelCatalogItem,
  ModelEffort,
  ModelPhaseSetting,
  ModelProvider,
  ModelSettingInput,
} from "@/lib/growth/modelSettings";

import { sessionHeaders } from "./sessionHeaders";

export const BOARD_URL = "/api/growth/approve";

export const PROMPTS_URL = "/api/growth/prompts";

export const PROPOSAL_ARTIFACT_URL = "/api/growth/proposal-artifact";

export const OPS_URL = "/api/growth/ops";

export const MODEL_SETTINGS_URL = "/api/growth/model-settings";

const SESSION_EXPIRED_MESSAGE = "セッションの有効期限が切れました。もう一度ログインしてください。";

export class SessionExpiredError extends Error {
  constructor() {
    super(SESSION_EXPIRED_MESSAGE);
    this.name = "SessionExpiredError";
  }
}

export function isSessionExpiredError(error: unknown): error is SessionExpiredError {
  return error instanceof SessionExpiredError;
}

export interface ProposalArtifactBlock {
  id: string;
  type: string;
  text: string;
}

/** プロンプト確認タブのデータ(前提情報の生テキスト＋フェーズ群)。 */
export interface PromptsData {
  facilityContext: string | null;
  warnings: string[];
  groups: PromptGroup[];
}

export interface ModelSettingsData {
  storageAvailable: boolean;
  warning: string | null;
  settings: ModelPhaseSetting[];
  catalog: ModelCatalogItem[];
  efforts: Record<ModelProvider, readonly ModelEffort[]>;
}

export async function fetchModelSettings(_token: string): Promise<ModelSettingsData> {
  const res = await fetch(MODEL_SETTINGS_URL, { headers: sessionHeaders() });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "AIモデル設定の取得に失敗しました。");
  }
  return {
    storageAvailable: json.storageAvailable === true,
    warning: typeof json.warning === "string" ? json.warning : null,
    settings: Array.isArray(json.settings) ? (json.settings as ModelPhaseSetting[]) : [],
    catalog: Array.isArray(json.catalog) ? (json.catalog as ModelCatalogItem[]) : [],
    efforts: json.efforts as Record<ModelProvider, readonly ModelEffort[]>,
  };
}

export async function putModelSetting(
  token: string,
  input: ModelSettingInput,
): Promise<ModelPhaseSetting> {
  const res = await fetch(MODEL_SETTINGS_URL, {
    method: "PUT",
    headers: sessionHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(input),
  });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success || !json.setting) {
    throw new Error(json.error ?? "AIモデル設定の保存に失敗しました。");
  }
  return json.setting as ModelPhaseSetting;
}

/**
 * 各フェーズのプロンプトと前提情報(facility-context)を取得する。read-only。
 * 失敗時は表示用メッセージを持つ Error を投げる(401 は合言葉エラー、その他は error 文言)。
 */
export async function fetchPrompts(_token: string): Promise<PromptsData> {
  const res = await fetch(PROMPTS_URL, { headers: sessionHeaders() });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(json.error ?? "取得に失敗しました。");
  }
  // 外部レスポンスを鵜呑みにせず最小限の形チェックをしてから返す(壊れた本文での描画時例外を防ぐ)。
  return {
    facilityContext: typeof json.facilityContext === "string" ? json.facilityContext : null,
    warnings: Array.isArray(json.warnings) ? (json.warnings as string[]) : [],
    groups: Array.isArray(json.groups) ? (json.groups as PromptGroup[]) : [],
  };
}

/**
 * 承認待ち一覧を取得する。失敗時は表示用メッセージを持つ Error を投げる
 * (ApproveClient.fetchPending と同一挙動: 401 は合言葉エラー、その他は error 文言)。
 */
export async function fetchBoard(_token: string): Promise<PendingItem[]> {
  const res = await fetch(BOARD_URL, { headers: sessionHeaders() });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(json.error ?? "取得に失敗しました。");
  }
  return json.items as PendingItem[];
}

/** Worker運用状態を取得する。未設定時は setupMissing=true の空データを返す。 */
export async function fetchOps(_token: string): Promise<GrowthOpsView> {
  const res = await fetch(OPS_URL, { headers: sessionHeaders() });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    if (res.status === 401) throw new SessionExpiredError();
    throw new Error(json.error ?? "運用状態の取得に失敗しました。");
  }
  return json.ops as GrowthOpsView;
}

/** 成果物化済み施策の Notion 本文を、画面表示用のテキストブロックとして取得する。 */
export async function fetchProposalArtifact(token: string, pageId: string): Promise<ProposalArtifactBlock[]> {
  const res = await fetch(`${PROPOSAL_ARTIFACT_URL}?pageId=${encodeURIComponent(pageId)}`, {
    headers: sessionHeaders(),
  });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "成果物の取得に失敗しました。");
  }
  return Array.isArray(json.blocks) ? (json.blocks as ProposalArtifactBlock[]) : [];
}

/** 承認/却下/クローズ/承認待ち復帰: ステータスを1件更新する。失敗時は表示用 Error を投げる。 */
export async function postDecision(token: string, id: string, decision: string): Promise<void> {
  const res = await fetch(BOARD_URL, {
    method: "POST",
    headers: sessionHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ decisions: [{ id, decision }] }),
  });
  const json = await readJsonObject(res);
  if (!res.ok || !json.success) {
    throw new Error(json.error ?? "保存に失敗しました。");
  }
}

async function postJson(token: string, url: string, body: unknown): Promise<{ status: number; ok: boolean; error?: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: sessionHeaders({ "Content-Type": "application/json" }),
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

/** 下書き作成済みを提案中に戻す(構成からやり直す)。409 は段階エラー、その他は表示用 Error。 */
export async function postRevert(token: string, pageId: string): Promise<void> {
  const res = await postJson(token, "/api/growth/approve/revert", { pageId });
  if (!res.ok) {
    throw new Error(
      res.status === 409
        ? "この記事は生成中・公開済みのため、提案中に戻せません。"
        : res.error ?? "提案中に戻せませんでした。"
    );
  }
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
  action: "apply" | "discard",
  payload?: { outline?: string; applyTitle?: boolean },
): Promise<void> {
  const res = await postJson(token, "/api/growth/revise/apply", { pageId, action, ...payload });
  if (!res.ok) {
    throw new Error(res.error ?? "更新に失敗しました。");
  }
}
