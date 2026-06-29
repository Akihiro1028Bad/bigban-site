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

/** 修正ループ(#40)の往復状態。failed=外部障害で失敗(再依頼可)。 */
export type ReviseStatus = "none" | "requested" | "presenting" | "failed";

/** 仮説カード(承認の判断材料)。 */
export interface Hypothesis {
  articleType: string;
  targetReader: string;
  searchIntent: string;
  winningAngle: string;
  successMetric: string;
  plannedCta: string;
}

/** GSC 検索成績。 */
export interface SearchMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  topQueries: string[];
}

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

/**
 * 画像指示(#proto・再設計): house style(宇宙人マスコット×コスミック)はロック済みのため、
 * レビュアーが決めるのは「画像を出すか(mode)」と「宇宙人が何をしているか(action)」の最大2点のみ。
 * - off:    このセクションは画像なし
 * - auto:   おまかせ(見出しから自動生成・既定)。imageInstruction 未設定も auto 相当(欠落耐性)。
 * - custom: action(一言)で指定
 */
export type ImageMode = "off" | "auto" | "custom";

export interface ImageInstruction {
  mode: ImageMode;
  /** mode==="custom" のときの宇宙人の行為一言。 */
  action?: string;
  /** 先頭セクションをアイキャッチに使う(16:9・文字余白)。 */
  isEyecatch?: boolean;
  /** 「高度な指定」自由記述(任意・既定は隠す)。 */
  advancedNote?: string;
}

export interface OutlineSection {
  heading: string;
  summary: string;
  /** 旧来の表示用ヒント(初期値・"mascot: X" 等)。初期ロードで imageInstruction へ正規化する。 */
  imageHint?: string;
  /** 画像指示(おまかせ/オフ/指定)。未設定は auto 相当。 */
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
  /** GSC 検索成績(#計測強化 S2)。 */
  search?: SearchMetrics;
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
  /** アイキャッチの実画像URL(data-URI/objectURL)。未設定なら hue グラデーション。 */
  eyecatchUrl?: string;
  bodyImages: number;
  /** 本文画像の色相(モックの見た目の種)。bodyImages と同数。 */
  bodyImageHues?: number[];
  /** 本文画像の実画像URL(差し替え/再生成で設定)。bodyImages と同数。 */
  bodyImageUrls?: (string | undefined)[];
  decorations: number;
  /** 生成中の進捗(0-100)。生成のライブ感に使う。 */
  genProgress?: number;
  /** 本文への行コメント(#182)。 */
  bodyComments?: BodyComment[];
  /** 本文コメントのAI依頼状態。 */
  bodyCommentStatus?: ReviseStatus;
  /** 提示中の本文コメント修正案。 */
  bodyCommentFixes?: BodyCommentFix[];
  /** 仮説カード(記事の狙い)。 */
  hypothesis?: Hypothesis;
  /** メタディスクリプション(SEOスニペット・#H20)。 */
  metaDescription?: string;
  /** アドバイス(#146)の依頼状態。failed=失敗(再依頼可)。 */
  adviceStatus?: ReviseStatus;
  /** アドバイス依頼時の「見てほしい点」。 */
  adviceInstruction?: string;
  /** 生成滞留(自宅PCの巡回停止の疑い)。 */
  stuck?: boolean;
  /** 施策トリアージの状態(設定されていれば「施策」として扱う)。 */
  proposalStatus?: ProposalStatus;
  /** 施策のカテゴリ。 */
  proposalCategory?: string;
  /** 却下時の理由メモ(学習ループの種地)。 */
  proposalRejectNote?: string;
  /** 施策の根拠メトリクスchip(派生元の伸び等)。 */
  evidence?: string[];
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
  /** 公開からの経過日数(行動ラベルの「要改稿」判定に使う)。 */
  publishedDaysAgo?: number;
  /** 生成中の進捗ラベル。 */
  generatingStep?: string;
}

export type SegmentKey = "all" | "awaiting" | "generating" | "published";

/** 左レールの主ビュー。 */
export type MainView = "proposal" | "approve" | "prompt" | "performance" | "queue";

/** 施策トリアージの状態。 */
export type ProposalStatus = "pending" | "rejected" | "adopted";

export type DetailTab =
  | "outline"
  | "prompt"
  | "preview"
  | "bodyComment"
  | "revise"
  | "images"
  | "advice";

/** 本文への行コメント(#182)。block=トップレベル要素index, unit=対象の文/項目。 */
export interface BodyComment {
  block: number;
  unit: string;
  text: string;
}

/** 本文コメント由来の修正案(ブロック単位の before/after)。 */
export interface BodyCommentFix {
  block: number;
  from: string;
  to: string;
  sentence: string;
}

export interface Toast {
  id: number;
  tone: "success" | "info" | "danger";
  text: string;
}
