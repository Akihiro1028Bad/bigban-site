/**
 * 全画面2ペイン編集ワークスペース(#104)の純ロジック。
 *
 * DOM 非依存。プレビュー幅プリセットと、狭い画面のタブ表示クラス計算を提供する。
 * 結線(モーダル/フォーカストラップ/iframe)は DraftEditWorkspace.tsx 側(カバレッジ除外)。
 */

/** 右ペイン(本番プレビュー)の幅プリセット。本番のレスポンシブを実幅で確認するための切替。 */
export type PreviewWidthKey = "desktop" | "mobile";

interface PreviewWidthPreset {
  key: PreviewWidthKey;
  /** 幅トグルのボタン表示名。 */
  label: string;
  /** iframe ラッパへ適用する CSS width。 */
  css: string;
}

// 分岐を作らない単一定義。desktop=ペイン幅いっぱい、mobile=スマホ実幅(390px)。
export const PREVIEW_WIDTH_PRESETS: readonly PreviewWidthPreset[] = [
  { key: "desktop", label: "PC", css: "100%" },
  { key: "mobile", label: "スマホ", css: "390px" },
];

const PREVIEW_WIDTH_CSS: Record<PreviewWidthKey, string> = Object.fromEntries(
  PREVIEW_WIDTH_PRESETS.map((p) => [p.key, p.css]),
) as Record<PreviewWidthKey, string>;

/** プレビュー幅キー → iframe ラッパに適用する CSS width。 */
export function previewWidthCss(key: PreviewWidthKey): string {
  return PREVIEW_WIDTH_CSS[key];
}

/** 狭い画面のタブ(編集|プレビュー)。広い画面は CSS(lg:) で両ペイン表示。 */
export type WorkspaceTab = "edit" | "preview";

/** タブを切り替える(編集 ⇄ プレビュー)。 */
export function otherTab(tab: WorkspaceTab): WorkspaceTab {
  return tab === "edit" ? "preview" : "edit";
}

/**
 * ペインの表示クラス。
 * 狭い画面では activeTab のペインだけ表示(他は hidden)。
 * lg 以上は `lg:block` で常に両ペインを表示する。
 */
export function paneClass(activeTab: WorkspaceTab, pane: WorkspaceTab): string {
  return activeTab === pane ? "block lg:block" : "hidden lg:block";
}
