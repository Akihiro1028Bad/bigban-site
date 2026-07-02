/**
 * 構成やり直しの確認ダイアログ(#167/H2 / 構成からやり直す)。
 * 取り消しづらい/破棄を伴う操作(下書き・手動編集・アイキャッチ・本文画像の作り直し)の前に
 * 必ず挟み、対象タイトルを明示する。見た目は proto(#proto ConfirmActionDialog)ダークへ再スキン。
 * #167 で公開/クローズは詳細パネルから撤去済みのため revert 専用へ narrow 化した。
 */

"use client";

import { IconWand } from "./ui/icons";
import { Kbd } from "./ui/primitives";
import { handleOverlayKeyDown } from "./hooks/overlayKeyDown";
import { useDialog } from "./hooks/useDialog";

export interface ConfirmActionState {
  kind: "revert";
  id: string;
  title: string;
}

interface ConfirmActionDialogProps {
  action: ConfirmActionState;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

// revert 単一設定。aria-label は #167 以前から不変(既存テスト・回帰防止)。
const REVERT_CONFIG = {
  ariaLabel: "構成からやり直すの確認",
  heading: "構成からやり直しますか？",
  body: "提案中（構成案レビュー）に戻します。再承認すると、現在の下書き・手動編集・アイキャッチ・本文画像は作り直されます。",
  confirmLabel: "提案中に戻す",
} as const;

export function ConfirmActionDialog({ action, busy, onCancel, onConfirm }: ConfirmActionDialogProps) {
  const dialogRef = useDialog();
  return (
    // approve-shell: fixed overlay は .approve-shell 配下の外に出るため、root 自身に付けて
    // var(--p-*) トークンを解決する(ConsultDrawer 方式)。
    // z-[80]: 詳細パネル(z-50)・編集ワークスペース(z-60)・コマンドパレット(z-70)より上に出す。
    // 確認は詳細パネル内のボタンから開くため、パネルより前面でないと裏に隠れて操作できない。
    <div
      className="approve-shell fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[18vh]"
      style={{ background: "rgba(4,6,9,0.6)", backdropFilter: "blur(3px)" }}
      onMouseDown={onCancel}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={REVERT_CONFIG.ariaLabel}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleOverlayKeyDown(e, onCancel)}
        className="w-full max-w-[440px] overflow-hidden rounded-[14px]"
        style={{
          background: "var(--p-bg-elevated)",
          border: "1px solid var(--p-border-strong)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        }}
      >
        <div className="flex items-start gap-3 p-5">
          <span
            className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px]"
            style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
          >
            <IconWand size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold" style={{ color: "var(--p-text)" }}>
              {REVERT_CONFIG.heading}
            </div>
            <div className="mt-0.5 truncate text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
              {action.title}
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
              {REVERT_CONFIG.body}
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-2 px-5 py-3.5"
          style={{ borderTop: "1px solid var(--p-border)" }}
        >
          <span className="mr-auto">
            <Kbd>esc</Kbd>
          </span>
          <button type="button" onClick={onCancel} className="approve-btn-ghost">
            キャンセル
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className="approve-btn-primary flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold disabled:opacity-50"
            style={{ background: "var(--p-amber)", color: "#1a1305" }}
          >
            {REVERT_CONFIG.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
