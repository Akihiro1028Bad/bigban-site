/**
 * 下書きプレビューの型(#H7 分解で共有化)。ApproveClient と DraftReadyView 等で共有する。
 */

import type { AdviceView } from "@/lib/growth/advise";
import type { AdviceApplyView } from "@/lib/growth/adviseApply";
import type { BodyCommentView } from "@/lib/growth/bodyComment";
import type { BodyRegenStatus } from "@/lib/growth/bodyImageRegen";
import type { DecorateView } from "@/lib/growth/decorate";
import type { RegenStatus } from "@/lib/growth/eyecatchRegen";

// #75: 下書きプレビューの内容。
export interface DraftPreview {
  title: string;
  displayMode: "html" | "rich";
  bodyHtml: string;
  body: string;
  // #141: アイキャッチURLミラー(未設定は空文字)。プレビュー上部の画像表示に使う。
  eyecatch?: string;
  // #146: スタイリング・アドバイスの表示用ビュー(ステータス＋提示中のみ解析済み)。
  advice?: AdviceView;
  // #165: アドバイス採用→反映の表示用ビュー(ステータス＋提示中のみ before/after 案)。
  adviceApply?: AdviceApplyView;
  // #147: 装飾提案の表示用ビュー(ステータス＋提示中のみ解析済み提案配列)。
  decorate?: DecorateView;
  // #166: AI再生成の依頼中/処理中/失敗の表示用ビュー(本文画像は対象src付き)。
  bodyRegen?: { status: BodyRegenStatus; targetSrc: string; requestedAtMs?: number | null };
  eyecatchRegen?: { status: RegenStatus; requestedAtMs?: number | null };
  // #182: 本文インラインコメントの表示用ビュー(ステータス＋投稿済みコメント)。
  bodyComment?: BodyCommentView;
  // #H19: 既知の公開記事リンクパス(/ja/news/<slug>)。壊れ内部リンク検査に使う(取得不可なら未設定)。
  knownNewsPaths?: readonly string[];
  // 確認済み情報源リストから復元した、可変情報のblock解除に使う事実。
  confirmedFacts?: readonly string[];
}

// #75: 下書きプレビューの取得状態。
export type DraftState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error"; error: string }
  | { status: "ready"; draft: DraftPreview };
