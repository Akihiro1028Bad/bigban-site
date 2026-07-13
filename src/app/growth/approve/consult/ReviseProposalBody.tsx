"use client";

/**
 * AI相談ドロワーの「構成案修正」提示ボディ。
 *
 * プロト版のダークトークンと全文差分フォールバックの見た目を踏襲しつつ、
 * 構成案は `alignOutlineSections` で対応付け、セクション単位で採用できる。
 * - 採用: 選択された差分だけを `mergeOutlineSelection` で決定的に結合する
 * - 却下: 非選択差分と非選択タイトルを既存の却下ログ payload として親へ渡す
 * - 対応付け不能時: 部分適用による誤反映を避け、従来の全文差分表示へ戻す
 * - タイトル: 元タイトルはこの props では持たないため、提案のみを表示・選択する
 *
 * body ルート、対象ごとの個別 apply、独自の差分コンポーネントは扱わない。
 * 親が status・依頼フォーム・保存操作を担い、ここでは選択と payload 構築だけを担う。
 */

import { useState } from "react";

import {
  alignOutlineSections,
  mergeOutlineSelection,
  sectionText,
  type OutlineAlignItem,
} from "../outlineAlign";
import { WordDiffView } from "../WordDiffView";

export interface RejectedFixPayload {
  aspect: string;
  detail: string;
  before: string;
  after: string;
}

export interface ReviseApplyPayload {
  outline?: string;
  applyTitle: boolean;
  rejected: RejectedFixPayload[];
}

interface ReviseProposalBodyProps {
  currentOutline: string;
  outlineProposal: string;
  titleProposal: string;
  busy: boolean;
  onApply: (payload: ReviseApplyPayload) => void;
  onDiscard: (rejected: RejectedFixPayload[]) => void;
}

const KIND_LABEL = { modified: "変更", added: "追加", removed: "削除" } as const;

const KIND_STYLE = {
  modified: { background: "var(--p-amber-weak)", color: "var(--p-amber)" },
  added: { background: "var(--p-green-weak)", color: "var(--p-green)" },
  removed: { background: "var(--p-red-weak)", color: "var(--p-red)" },
} as const;

function rejectedFix(item: OutlineAlignItem): RejectedFixPayload | null {
  if (item.kind === "unchanged") return null;

  const before = item.kind === "added" ? "" : sectionText(item.before);
  const after = item.kind === "removed" ? "" : sectionText(item.after);
  const heading = item.kind === "added" ? item.after.heading : item.before.heading;

  return {
    aspect: "構成案修正",
    detail: `セクション: ${heading}（${KIND_LABEL[item.kind]}）`,
    before,
    after,
  };
}

function FullDiff({
  currentOutline,
  outlineProposal,
  titleProposal,
  busy,
  onApply,
  onDiscard,
}: ReviseProposalBodyProps) {
  const hasTitleProposal = titleProposal !== "";
  const rejected: RejectedFixPayload[] = [
    ...(outlineProposal
      ? [{
          aspect: "構成案修正",
          detail: "構成案全体（全文差分）",
          before: currentOutline,
          after: outlineProposal,
        }]
      : []),
    ...(titleProposal
      ? [{
          aspect: "タイトル案",
          detail: "タイトルの修正案",
          before: "",
          after: titleProposal,
        }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      {hasTitleProposal ? (
        <section
          aria-label="タイトルの修正案"
          className="rounded-[12px] p-4"
          style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
        >
          <h4
            className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--p-text-3)" }}
          >
            タイトルの修正案
          </h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="min-w-0">
              <h5 className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-green)" }}>
                修正後のタイトル
              </h5>
              <p
                className="rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-medium"
                style={{
                  background: "var(--p-green-weak)",
                  boxShadow: "inset 2px 0 0 var(--p-green)",
                  color: "var(--p-text)",
                }}
              >
                {titleProposal}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section
        aria-label="構成案の修正案"
        className="rounded-[12px] p-4"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <h4
          className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--p-text-3)" }}
        >
          構成案の修正案
        </h4>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <h5 className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-text-3)" }}>
              元の構成案
            </h5>
            <pre
              className="whitespace-pre-wrap rounded-[8px] px-2.5 py-1.5 text-[12px]"
              style={{ background: "var(--p-bg-input)", color: "var(--p-text-3)" }}
            >
              {currentOutline}
            </pre>
          </div>
          <div className="min-w-0">
            <h5 className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-green)" }}>
              修正案
            </h5>
            <pre
              className="whitespace-pre-wrap rounded-[8px] px-2.5 py-1.5 text-[12px]"
              style={{
                background: "var(--p-green-weak)",
                boxShadow: "inset 2px 0 0 var(--p-green)",
                color: "var(--p-text)",
              }}
            >
              {outlineProposal}
            </pre>
          </div>
        </div>
        <div className="mt-3">
          <h5 className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-text-3)" }}>
            変更点（差分）
          </h5>
          <WordDiffView before={currentOutline} after={outlineProposal} />
        </div>
      </section>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onApply({ applyTitle: true, rejected: [] })}
          disabled={busy}
          className="approve-btn-primary flex-1 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          反映する
        </button>
        <button
          type="button"
          onClick={() => onDiscard(rejected)}
          disabled={busy}
          className="approve-btn-ghost flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-40"
        >
          やり直し
        </button>
      </div>
    </div>
  );
}

export function ReviseProposalBody(props: ReviseProposalBodyProps) {
  const alignment = props.outlineProposal
    ? alignOutlineSections(props.currentOutline, props.outlineProposal)
    : [];
  const changed = alignment?.filter((item) => item.kind !== "unchanged") ?? [];
  const proposalKey = `${props.currentOutline}\u0000${props.outlineProposal}\u0000${props.titleProposal}`;
  const [previousKey, setPreviousKey] = useState(proposalKey);
  const initialSelected = new Set(changed.map((item) => item.id));
  const [selectedIds, setSelectedIds] = useState<Set<number>>(initialSelected);
  const [isTitleSelected, setIsTitleSelected] = useState(props.titleProposal !== "");

  if (proposalKey !== previousKey) {
    setPreviousKey(proposalKey);
    setSelectedIds(initialSelected);
    setIsTitleSelected(props.titleProposal !== "");
  }

  if (alignment === null) return <FullDiff {...props} />;

  const selectedChanged = changed.filter((item) => selectedIds.has(item.id));
  const selectedCount = selectedChanged.length + (isTitleSelected && props.titleProposal ? 1 : 0);
  const rejected = changed
    .flatMap((item) => (selectedIds.has(item.id) ? [] : [rejectedFix(item)]))
    .filter((item): item is RejectedFixPayload => item !== null);
  const allRejected = changed
    .flatMap((item) => [rejectedFix(item)])
    .filter((item): item is RejectedFixPayload => item !== null);

  if (props.titleProposal) {
    const titleRejected = {
      aspect: "タイトル案",
      detail: "タイトルの修正案",
      before: "",
      after: props.titleProposal,
    };

    if (!isTitleSelected) rejected.push(titleRejected);
    allRejected.push(titleRejected);
  }

  function toggleSection(id: number): void {
    setSelectedIds((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
        修正案が届きました。元と見比べて反映してください。
      </p>

      {props.titleProposal ? (
        <section
          aria-label="タイトルの修正案"
          className="rounded-[12px] p-3"
          style={{
            background: "var(--p-bg-raised)",
            border: "1px solid var(--p-border)",
            opacity: isTitleSelected ? 1 : 0.55,
          }}
        >
          <h4
            className="mb-3 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: "var(--p-text-3)" }}
          >
            タイトルの修正案
          </h4>
          <label
            className="flex cursor-pointer items-center gap-1 text-[11px]"
            style={{ color: "var(--p-accent-ink)" }}
          >
            <input
              type="checkbox"
              checked={isTitleSelected}
              onChange={() => setIsTitleSelected((value) => !value)}
              aria-label="タイトル案を反映"
            />
            <span
              className="rounded-[8px] px-2.5 py-1.5 text-[12.5px] font-medium"
              style={{
                background: "var(--p-green-weak)",
                boxShadow: "inset 2px 0 0 var(--p-green)",
                color: "var(--p-text)",
              }}
            >
              タイトル案: {props.titleProposal}
            </span>
          </label>
        </section>
      ) : null}

      {changed.map((item) => {
        const before = item.kind === "added" ? "" : sectionText(item.before);
        const after = item.kind === "removed" ? "" : sectionText(item.after);
        const heading = item.kind === "added" ? item.after.heading : item.before.heading;
        const isSelected = selectedIds.has(item.id);

        return (
          <section
            key={item.id}
            className="rounded-[12px] p-3"
            style={{
              background: "var(--p-bg-raised)",
              border: "1px solid var(--p-border)",
              opacity: isSelected ? 1 : 0.55,
            }}
          >
            <label
              className="flex cursor-pointer items-center gap-1 text-[11px]"
              style={{ color: "var(--p-accent-ink)" }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleSection(item.id)}
                aria-label={`${heading}の変更を反映`}
              />
              <span>{heading}</span>
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={KIND_STYLE[item.kind]}
              >
                {KIND_LABEL[item.kind]}
              </span>
            </label>
            <div className="mt-2">
              <WordDiffView before={before} after={after} />
            </div>
          </section>
        );
      })}

      {changed.length === 0 && !props.titleProposal ? (
        <p className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
          変更はありませんでした
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={props.busy || selectedCount === 0}
          onClick={() =>
            props.onApply({
              ...(selectedChanged.length > 0
                ? { outline: mergeOutlineSelection(alignment, selectedIds) }
                : {}),
              applyTitle: isTitleSelected,
              rejected,
            })
          }
          className="approve-btn-primary flex-1 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        >
          選択を反映（{selectedCount}）
        </button>
        <button
          type="button"
          disabled={props.busy}
          onClick={() => props.onDiscard(allRejected)}
          className="approve-btn-ghost flex-1 justify-center disabled:cursor-not-allowed disabled:opacity-40"
        >
          反映しない（破棄）
        </button>
      </div>
    </div>
  );
}
