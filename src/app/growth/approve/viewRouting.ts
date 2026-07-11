/**
 * 承認画面のナビ(6 view)ルーティングの純ロジック(#proto P1)。DOM/IO 非依存。
 * proto MainView 語彙へ統一(施策/記事/プロンプト/成績/公開キュー/運用)。旧 proposals|articles|prompts は廃止。
 */

export type ApproveView = "home" | "proposal" | "approve" | "queue" | "performance" | "settings" | "ops";
export type SettingsSection = "models" | "prompts";

export const APPROVE_VIEWS: readonly ApproveView[] = [
  "home",
  "proposal",
  "approve",
  "queue",
  "performance",
  "settings",
  "ops",
];

/** `?view` の生値を ApproveView に正規化する。未知/欠落は null。 */
export function parseView(raw: string | null | undefined): ApproveView | null {
  return APPROVE_VIEWS.includes(raw as ApproveView) ? (raw as ApproveView) : null;
}

export function parseSettingsSection(raw: string | null | undefined): SettingsSection {
  return raw === "prompts" ? "prompts" : "models";
}

export function resolveLegacyView(raw: string | null | undefined): {
  view: ApproveView | null;
  section: SettingsSection | null;
} {
  if (raw === "prompt") return { view: "settings", section: "prompts" };
  if (raw === "models") return { view: "settings", section: "models" };
  return { view: parseView(raw), section: null };
}

export function viewLocation(
  currentHref: string,
  view: ApproveView,
  settingsSection: SettingsSection,
): string {
  const url = new URL(currentHref);
  url.searchParams.set("view", view);
  if (view === "settings") url.searchParams.set("section", settingsSection);
  else url.searchParams.delete("section");
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * URL の `?draft`(=下書きID/contentId)を読み取る。ディープリンク(通知の「承認画面で開く」)で
 * 対象記事を自動選択するために使う。SSR 安全(window ガード)。欠落/空文字は null。
 */
export function initialDraftFromUrl(): string | null {
  /* istanbul ignore next -- @preserve SSR 専用パス: jsdom では window 常在のため到達不可 */
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("draft");
  return raw && raw.length > 0 ? raw : null;
}

/**
 * 初期表示 view を決める(proto 既定着地)。
 * 1. URL の view が妥当ならそれを使う。
 * 2. 施策に未処理があれば施策。
 * 3. あなた待ち(記事 actionable)があれば記事。
 * 4. どちらも無ければ成績。
 */
export function decideInitialView(
  param: string | null | undefined,
  _counts: { proposalPending: number; awaiting: number },
): ApproveView {
  const resolved = resolveLegacyView(param);
  if (resolved.view) return resolved.view;
  return "home";
}
