/**
 * 承認画面プロトタイプの型(#proto)。本番 types.ts とは独立。
 */

export type Stage =
  | "idea"
  | "outline_review"
  | "generating"
  | "draft_review"
  | "scheduled"
  | "published";

export type DiffKind = "same" | "add" | "del";

export interface DiffToken {
  kind: DiffKind;
  text: string;
}

/** 修正ループ(#40)の往復状態。 */
export type ReviseStatus = "none" | "requested" | "presenting";

/** 修正対象。構成案/タイトル/本文に指示を出せる。 */
export type ReviseTarget = "outline" | "title" | "body";

export interface ReviseField {
  from: string;
  to: string;
}

export interface OutlineReviseField {
  from: OutlineSection[];
  to: OutlineSection[];
}

/** 提示された修正案(指示が来た対象だけ入る)。 */
export interface ReviseProposal {
  outline?: OutlineReviseField;
  title?: ReviseField;
  body?: ReviseField;
}

export type ImageStyle = "mascot" | "minimal" | "diagram";

export interface ImageInstruction {
  style: ImageStyle;
  description: string;
}

export interface OutlineSection {
  heading: string;
  summary: string;
  /** 旧来の表示用ヒント(初期値)。imageInstruction があればそちらを優先。 */
  imageHint?: string;
  /** 編集された画像指示(スタイル＋説明)。 */
  imageInstruction?: ImageInstruction;
  /** セクションへの行コメント。 */
  comments?: string[];
}

export interface AdviceScore {
  label: string;
  score: number;
}

export interface AdviceFix {
  quote: string;
  reason: string;
  suggestion: string;
}

export interface Advice {
  overall: number;
  scores: AdviceScore[];
  strengths: string[];
  fixes: AdviceFix[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
}

export interface ReferenceLink {
  title: string;
  source: string;
}

export interface Metrics {
  views: number;
  users: number;
  deltaPct: number;
  /** 直近の日次表示数(スパークライン用・基準=7日)。 */
  series: number[];
}

export interface Article {
  id: string;
  title: string;
  stage: Stage;
  /** 優先度スコア 0-100。 */
  score: number;
  /** あなたのアクション待ちか。 */
  awaitingYou: boolean;
  updatedLabel: string;
  excerpt: string;
  keyword: string;
  /** モックのアイキャッチ色相(0-360)。 */
  hue: number;
  wordCount: number;
  readMinutes: number;
  outline: OutlineSection[];
  prompt: string;
  refs: ReferenceLink[];
  bodyHtml: string;
  hasEyecatch: boolean;
  bodyImages: number;
  /** 本文画像の色相(モックの見た目の種)。bodyImages と同数。 */
  bodyImageHues?: number[];
  decorations: number;
  /** 生成中の進捗(0-100)。生成のライブ感に使う。 */
  genProgress?: number;
  advice: Advice;
  checklist: ChecklistItem[];
  /** 修正ループの状態(既定は none 扱い)。 */
  reviseStatus?: ReviseStatus;
  /** 依頼時の指示文(対象ごと)。 */
  reviseInstruction?: { outline?: string; title?: string; body?: string };
  /** 提示中の修正案。 */
  reviseProposal?: ReviseProposal;
  scheduledLabel?: string;
  /** 予約公開の時刻(ms)。並び替え用。 */
  scheduledAtMs?: number;
  metrics?: Metrics;
  /** 生成中の進捗ラベル。 */
  generatingStep?: string;
}

export type SegmentKey = "all" | "awaiting" | "generating" | "published";

/** 盤の表示モード(リスト⇄カンバン)。 */
export type BoardMode = "list" | "kanban";

/** 左レールの主ビュー。 */
export type MainView = "approve" | "performance" | "queue";

export type DetailTab =
  | "outline"
  | "prompt"
  | "preview"
  | "revise"
  | "images"
  | "advice";

export interface Toast {
  id: number;
  tone: "success" | "info" | "danger";
  text: string;
}
