/**
 * 相談ドロワー(#proto・往復統合): 右レール型。3モードの入力・待ち・提示・反映を1か所へ集約。
 * 本文は左に残りクリック可(全画面モーダルにしない)。モバイルはフルレ幅＋scrim。
 */
"use client";

import { AnimatePresence, motion } from "framer-motion";

import { ConsultCard } from "./ConsultCard";
import { ConsultComposer } from "./ConsultComposer";
import type { Consult, ConsultKind, ReviseTarget } from "./types";
import { Kbd } from "./ui";
import { useDialog } from "./useDialog";

const MODES: { key: ConsultKind; label: string }[] = [
  { key: "overall", label: "全体を見てもらう" },
  { key: "revise", label: "ここを直す" },
  { key: "sentence", label: "この文" },
];

interface ConsultDrawerProps {
  open: boolean;
  mode: ConsultKind;
  consults: Consult[];
  articleId: string;
  adoptedFixes: Set<string>;
  sentenceCount: number;
  onModeChange: (mode: ConsultKind) => void;
  onClose: () => void;
  onSubmitOverall: (focus: string) => void;
  onSubmitRevise: (i: { title?: string; body?: string }) => void;
  onSubmitSentence: () => void;
  onRetry: (id: string) => void;
  onDismiss: (id: string) => void;
  onApplyRevise: (id: string, target: ReviseTarget) => void;
  onDismissRevise: (id: string, target: ReviseTarget) => void;
  onAdoptAdvice: (id: string, index: number) => void;
  onApplyFix: (id: string, block: number) => void;
  onDismissFix: (id: string, block: number) => void;
  onApplyAll: (id: string) => void;
}

export function ConsultDrawer(props: ConsultDrawerProps) {
  const dialogRef = useDialog();
  const { open, mode, consults } = props;
  // 新しい順(末尾追加なので逆順表示)。
  const stream = [...consults].reverse();
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* モバイルのみ scrim(lg 以上は本文操作を妨げない) */}
          <motion.div
            className="fixed inset-0 z-40 lg:hidden"
            style={{ background: "rgba(4,6,9,0.5)" }}
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={props.onClose}
          />
          <motion.aside
            ref={dialogRef}
            role="dialog"
            aria-modal={false}
            aria-label="AIに相談"
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.2 }}
            className="fixed right-0 top-0 z-50 flex h-full w-full max-w-[440px] flex-col"
            style={{ background: "var(--p-bg-elevated)", borderLeft: "1px solid var(--p-border-strong)", boxShadow: "-18px 0 50px rgba(0,0,0,0.4)" }}
          >
            <div className="flex shrink-0 items-center gap-2 px-5 py-3.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
              <span className="text-[14px] font-semibold">AIに相談</span>
              <button onClick={props.onClose} className="ml-auto" aria-label="閉じる"><Kbd>esc</Kbd></button>
            </div>

            <div className="flex shrink-0 items-center gap-1 px-4 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }} role="tablist" aria-label="相談モード">
              {MODES.map((m) => {
                const active = m.key === mode;
                return (
                  <button
                    key={m.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => props.onModeChange(m.key)}
                    className="rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium transition-colors"
                    style={{ background: active ? "var(--p-bg-active)" : "transparent", color: active ? "var(--p-text)" : "var(--p-text-3)" }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <ConsultComposer
                mode={mode}
                sentenceCount={props.sentenceCount}
                onSubmitOverall={props.onSubmitOverall}
                onSubmitRevise={props.onSubmitRevise}
                onSubmitSentence={props.onSubmitSentence}
              />
              {stream.length > 0 && (
                <>
                  <div className="my-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
                    相談の結果
                  </div>
                  <div className="flex flex-col gap-3">
                    {stream.map((c) => (
                      <ConsultCard
                        key={c.id}
                        consult={c}
                        articleId={props.articleId}
                        adoptedFixes={props.adoptedFixes}
                        onRetry={props.onRetry}
                        onDismiss={props.onDismiss}
                        onApplyRevise={props.onApplyRevise}
                        onDismissRevise={props.onDismissRevise}
                        onAdoptAdvice={props.onAdoptAdvice}
                        onApplyFix={props.onApplyFix}
                        onDismissFix={props.onDismissFix}
                        onApplyAll={props.onApplyAll}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
