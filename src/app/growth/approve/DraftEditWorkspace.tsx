"use client";

import { useEffect, useRef, useState } from "react";

import { DraftEditor } from "./DraftEditor";
import { DraftPreviewFrame } from "./DraftPreviewFrame";
import { MetaEditor } from "./DetailViews";
import {
  paneClass,
  PREVIEW_WIDTH_PRESETS,
  previewWidthCss,
  type PreviewWidthKey,
  type WorkspaceTab,
} from "./draftWorkspace";

interface DraftEditWorkspaceProps {
  /** モーダル見出しに出す記事タイトル。 */
  title: string;
  /** エディタ初期値(下書き本文 HTML)。 */
  initialHtml: string;
  /** デバウンス済みのライブプレビュー HTML。 */
  livePreviewHtml: string;
  /** 編集のたびに呼ぶ(親の editedHtml を更新)。 */
  onChange: (html: string) => void;
  /** 保存。 */
  onSave: () => void;
  /** キャンセル(未保存があれば親が破棄確認を出す)。× /Esc も同じ扱い。 */
  onCancel: () => void;
  saving: boolean;
  saveError: string;
  /** 未保存(original と差分あり)か。beforeunload の離脱警告に使う。 */
  dirty: boolean;
  /** 未保存の破棄確認中か。 */
  confirmDiscard: boolean;
  /** 破棄を確定して閉じる。 */
  onConfirmDiscard: () => void;
  /** 破棄をやめて編集に戻る。 */
  onCancelDiscard: () => void;
  /**
   * #P1⑤: 検索スニペット(メタディスクリプション)の初期値。既知の制約により
   * /api/growth/draft は excerpt を返さないため通常は空文字から編集開始する
   * (DetailPanel.tsx:441 と同じ挙動を踏襲・BE 変更しない方針)。
   */
  metaDescription?: string;
  /**
   * #P1⑤: メタディスクリプション保存。プレビュータブと同一の保存経路
   * (ApproveClient.saveMeta → POST /api/growth/draft/excerpt)へ結線する。
   */
  onSaveMeta: (text: string) => void;
}

// ダークテーマ(approveTheme.css の --p-* トークン)前提の共通ボタン基底。
// 色・状態はトークンで与え、管理画面(ダーク)と世界観を統一する。
const BTN =
  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";

/**
 * 全画面2ペインの編集ワークスペース(#104)。
 *
 * 左=エディタ(DraftEditor)/右=本番ライブプレビュー(DraftPreviewFrame)を横並びにし、
 * 狭い画面では 編集|プレビュー のタブにフォールバックする。route 遷移しない
 * クライアントオーバーレイ(passphrase 維持)。aria-modal・フォーカストラップ・Esc・
 * スクロールロック・フォーカス復帰を備える。外殻は --p-* ダークトークンで統一。
 *
 * モーダル/フォーカストラップ/iframe への薄い DOM 結線のためカバレッジ対象外
 * (vitest.config.ts)。純ロジックは draftWorkspace.ts でテスト済み。
 */
export function DraftEditWorkspace({
  title,
  initialHtml,
  livePreviewHtml,
  onChange,
  onSave,
  onCancel,
  saving,
  saveError,
  dirty,
  confirmDiscard,
  onConfirmDiscard,
  onCancelDiscard,
  metaDescription,
  onSaveMeta,
}: DraftEditWorkspaceProps) {
  const [previewWidth, setPreviewWidth] = useState<PreviewWidthKey>("desktop");
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("edit");
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 背景スクロールロック + 開いていたトリガーへフォーカス復帰。
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // #UI: 未保存(dirty)の間だけ、タブ閉じ/リロードに離脱警告を出す。
  // モーダル内の破棄確認(confirmDiscard)は別導線なのでここでは二重に出さない。
  useEffect(() => {
    if (!dirty) return;
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      // 一部ブラウザは returnValue のセットで確認ダイアログを出す。
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);

  // Esc で閉じ、Tab はモーダル内に閉じ込める(フォーカストラップ)。⌘S/Ctrl+S で保存。
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
      return;
    }
    // #UI: ⌘S / Ctrl+S でブラウザ標準保存を抑止して下書き保存へ。
    if ((event.metaKey || event.ctrlKey) && (event.key === "s" || event.key === "S")) {
      event.preventDefault();
      if (!saving && !confirmDiscard) onSave();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="approve-theme-scope fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="編集を閉じる"
        onClick={onCancel}
        className="absolute inset-0 bg-black/60"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="記事を編集"
        onKeyDown={handleKeyDown}
        className="relative flex h-[90vh] w-[90vw] max-w-[1400px] flex-col overflow-hidden rounded-lg border border-[var(--p-border-strong)] bg-[var(--p-bg-elevated)] text-[var(--p-text)] shadow-2xl"
      >
        {/* ヘッダ: タイトル / 幅トグル / 閉じる */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--p-border)] px-4 py-2">
          <h2 className="truncate text-sm font-bold text-[var(--p-text)]">
            記事を編集：{title}
          </h2>
          <div className="flex items-center gap-2">
            <div
              role="group"
              aria-label="プレビュー幅"
              className="hidden items-center gap-1 lg:flex"
            >
              {PREVIEW_WIDTH_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={previewWidth === p.key}
                  onClick={() => setPreviewWidth(p.key)}
                  className={`${BTN} border ${
                    previewWidth === p.key
                      ? "border-[var(--p-accent)] bg-[var(--p-accent-weak)] text-[var(--p-accent-ink)]"
                      : "border-[var(--p-border-strong)] bg-[var(--p-bg-raised)] text-[var(--p-text-2)] hover:bg-[var(--p-bg-hover)] hover:text-[var(--p-text)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <button
              ref={closeRef}
              type="button"
              aria-label="閉じる"
              onClick={onCancel}
              className={`${BTN} border border-[var(--p-border-strong)] bg-[var(--p-bg-raised)] text-[var(--p-text-2)] hover:bg-[var(--p-bg-hover)] hover:text-[var(--p-text)]`}
            >
              ✕
            </button>
          </div>
        </div>

        {/* 狭い画面用タブ */}
        <div
          role="tablist"
          aria-label="編集/プレビュー切替"
          className="flex gap-1 border-b border-[var(--p-border)] px-3 py-1 lg:hidden"
        >
          {(["edit", "preview"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={activeTab === t}
              onClick={() => setActiveTab(t)}
              className={`${BTN} ${
                activeTab === t
                  ? "bg-[var(--p-bg-active)] text-[var(--p-text)]"
                  : "text-[var(--p-text-2)] hover:text-[var(--p-text)]"
              }`}
            >
              {t === "edit" ? "編集" : "プレビュー"}
            </button>
          ))}
        </div>

        {/* 2ペイン本体 */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          <div
            className={`${paneClass(activeTab, "edit")} min-h-0 overflow-y-auto border-r border-[var(--p-border)] bg-[var(--p-bg)] p-3`}
          >
            {/* #P1⑤: 検索スニペット(メタディスクリプション)を本文を書く場所にも出す。
                プレビュータブと同一の MetaEditor / 保存経路を再利用(重複実装しない)。
                「本文から自動生成」はライブプレビュー HTML(直近の編集内容)を基に生成する。 */}
            <div className="mb-3">
              <MetaEditor
                bodyHtml={livePreviewHtml}
                metaDescription={metaDescription}
                onSave={onSaveMeta}
              />
            </div>
            <DraftEditor initialHtml={initialHtml} onChange={onChange} />
          </div>
          <div
            className={`${paneClass(activeTab, "preview")} min-h-0 overflow-y-auto bg-[var(--p-bg-elevated)] p-3`}
          >
            <p className="mb-1 text-xs text-[var(--p-text-2)]">本番プレビュー（入力に追従）</p>
            <div style={{ width: previewWidthCss(previewWidth), margin: "0 auto" }}>
              <DraftPreviewFrame
                title="本番ライブプレビュー"
                html={livePreviewHtml}
                className="h-[68vh] w-full rounded-md border border-[var(--p-border-strong)] bg-[#0A0A0A]"
              />
            </div>
          </div>
        </div>

        {/* 固定フッタ(保存バー) */}
        <div className="border-t border-[var(--p-border)] px-4 py-2">
          {saveError ? (
            <p role="alert" className="mb-2 text-sm text-[var(--p-red)]">
              {saveError}
            </p>
          ) : null}
          {confirmDiscard ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-[var(--p-amber-weak)] px-3 py-2 text-sm text-[var(--p-amber)]"
            >
              <span className="flex-1">未保存の変更を破棄しますか？</span>
              <button
                type="button"
                onClick={onConfirmDiscard}
                className={`${BTN} border border-[var(--p-red)] bg-[var(--p-red)] text-[#1a0d0d]`}
              >
                破棄する
              </button>
              <button
                type="button"
                onClick={onCancelDiscard}
                className={`${BTN} border border-[var(--p-border-strong)] bg-[var(--p-bg-raised)] text-[var(--p-text-2)] hover:bg-[var(--p-bg-hover)] hover:text-[var(--p-text)]`}
              >
                編集に戻る
              </button>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className={`${BTN} border border-[var(--p-border-strong)] bg-[var(--p-bg-raised)] text-[var(--p-text-2)] hover:bg-[var(--p-bg-hover)] hover:text-[var(--p-text)]`}
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={saving}
                title="保存 (⌘S)"
                className={`${BTN} border border-[var(--p-accent)] bg-[var(--p-accent)] text-[#0a0c10]`}
              >
                {saving ? "保存中…" : "保存"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
