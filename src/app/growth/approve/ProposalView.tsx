/**
 * 施策ビュー(#P5a・proto 移植): 施策(proposal)を状態別に並べ、承認(=記事化 等)/未処理に戻す/
 * 却下するトリアージ面。記事ビュー(BoardList+DetailPanel)と対称の master-detail。
 *
 * proto `approve-proto/ProposalView.tsx` の見た目(左一覧＋右詳細＋種別フィルタ chip＋結末プレビュー)を
 * 本番へ移植する。差分(確定した設計判断):
 * - データは本番 `PendingItem`(`Article` ではない)。種別(kind)は Notion に persist せず
 *   `kindFromCategory(subtitle/category)` で決定的に派生する(#P5a・欠落耐性)。ここでは行が持つ
 *   カテゴリ相当の文字列は `PendingItem.subtitle`(施策のカテゴリを載せる現行フィールド)を使う。
 * - トリアージ状態は本番の決定モデル(`decided` マップ)から導出する。未決定=pending、
 *   却下=rejected、承認=adopted。proto の proposalStatus フィールドは持たない。
 * - 承認/却下/未処理に戻すは**既存の実ハンドラ**(ApproveClient の decide/undo)へ結線する。
 *   本番の却下は理由メモを持たない(API 非対応)ため、proto の却下理由入力は移植せず即時却下にする
 *   (決定ロジックを ProposalView で作り直さない・実 API 経路不変)。
 * - 詳細本体は `ProposalDetailBody`({item, kind})。結末プレビューは `approveOutcomeFor(kind)`。
 */
"use client";

import { useState } from "react";

import { motion } from "framer-motion";

import { KIND_META, approveOutcomeFor, kindFromCategory } from "@/lib/growth/proposalKind";

import { ProposalDetailBody, KIND_ICON } from "./ProposalDetailBody";
import type { Choice, PendingItem, ProposalKind } from "./types";
import { IconArrowLeft, IconArrowRight, IconCheck, IconList, IconPlus, IconX } from "./ui/icons";

/** 施策のトリアージ状態(本番の決定モデルから導出)。 */
type ProposalTriageStatus = "pending" | "rejected" | "adopted";

const STATUS_META: Record<ProposalTriageStatus, { label: string; tone: string }> = {
  pending: { label: "未処理", tone: "var(--p-amber)" },
  adopted: { label: "承認済み", tone: "var(--p-green)" },
  rejected: { label: "却下", tone: "var(--p-text-3)" },
};
const ORDER: ProposalTriageStatus[] = ["pending", "adopted", "rejected"];

/** 種別フィルタの選択肢("all" + 全 ProposalKind)。 */
const KIND_FILTER_OPTIONS: Array<ProposalKind | "all"> = ["all", "article", "site", "event", "other"];

interface ProposalViewProps {
  /** 表示対象の施策(親で検索/優先度ソート済み)。 */
  proposals: PendingItem[];
  /** 保存済みの決定(承認/却下)。未決定は未登録。 */
  decided: Record<string, Choice | undefined>;
  /** 右詳細ペインでアクティブな施策 id(未選択は null)。 */
  activeId: string | null;
  /** 一覧で施策を選んだ(=詳細を開く)。 */
  onActivate: (id: string) => void;
  /** 承認する(=記事化 等・種別で出口が変わる)。実ハンドラ(decide 承認)へ結線。 */
  onApprove: (item: PendingItem) => void;
  /** 未処理に戻す(却下/承認の取り消し)。実ハンドラ(undo)へ結線。 */
  onReopen: (item: PendingItem) => void;
  /** 却下する。実ハンドラ(decide 却下)へ結線(本番は理由メモを持たない)。 */
  onReject: (item: PendingItem) => void;
  /** 作成モーダルを開く。 */
  onOpenForm: () => void;
}

/** 施策の種別を派生する(subtitle=カテゴリ相当。空/未知は article へフォールバック)。 */
function kindOf(item: PendingItem): ProposalKind {
  return kindFromCategory(item.subtitle ?? "");
}

/**
 * 施策のトリアージ状態を導出する。この場での決定(decided マップ)を最優先し、無ければ
 * サーバ由来の永続段階(stage)を読む(既に承認/却下済みで戻ってきた施策を正しく表示するため)。
 * 決定「操作」は ApproveClient の実ハンドラのまま(ここは状態の読み取りのみ・ロジック再実装ではない)。
 */
function statusOf(item: PendingItem, decided: Record<string, Choice | undefined>): ProposalTriageStatus {
  const choice = decided[item.id];
  if (choice === "承認") return "adopted";
  if (choice === "却下") return "rejected";
  if (item.stage === "approved") return "adopted";
  if (item.stage === "rejected") return "rejected";
  return "pending";
}

export function ProposalView({
  proposals,
  decided,
  activeId,
  onActivate,
  onApprove,
  onReopen,
  onReject,
  onOpenForm,
}: ProposalViewProps) {
  // 種別フィルタ。
  const [kindFilter, setKindFilter] = useState<ProposalKind | "all">("all");
  // 狭幅(lg未満)の1ペイン制御: 一覧で施策を選ぶと詳細へ、戻る/トリアージ完了で一覧へ。lg以上は常に両ペイン。
  const [showDetailMobile, setShowDetailMobile] = useState(false);

  const openDetail = (id: string): void => {
    onActivate(id);
    setShowDetailMobile(true);
  };
  const active = proposals.find((p) => p.id === activeId) ?? null;

  // kindFilter を適用してから状態別グループを作成する。
  const filteredProposals =
    kindFilter === "all" ? proposals : proposals.filter((p) => kindOf(p) === kindFilter);

  const groups = ORDER.map((status) => ({
    status,
    items: filteredProposals.filter((p) => statusOf(p, decided) === status),
  })).filter((g) => g.items.length > 0);

  return (
    <section aria-label="施策レーン" className="flex h-full min-h-0">
      <div
        className={`${showDetailMobile ? "hidden lg:block" : "block"} w-full overflow-y-auto lg:w-[40%] lg:min-w-[340px] lg:max-w-[500px]`}
        style={{ borderRight: "1px solid var(--p-border)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <IconList size={16} style={{ color: "var(--p-accent)" }} />
          <span className="text-[14px] font-semibold">施策</span>
          <button type="button" onClick={onOpenForm} className="proto-btn-ghost ml-auto">
            <IconPlus size={13} /> 手動で追加
          </button>
        </div>

        {/* 種別フィルタ chip 行 */}
        <div className="flex flex-wrap gap-1.5 px-4 py-2.5" style={{ borderBottom: "1px solid var(--p-border)" }}>
          {KIND_FILTER_OPTIONS.map((k) => {
            const isSelected = kindFilter === k;
            const count = k === "all" ? proposals.length : proposals.filter((p) => kindOf(p) === k).length;
            const label = k === "all" ? "すべて" : KIND_META[k].label;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                aria-pressed={isSelected}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-[3px] text-[11px] font-medium transition-colors"
                style={{
                  background: isSelected ? "var(--p-bg-active)" : "transparent",
                  border: `1px solid ${isSelected ? "var(--p-accent)" : "var(--p-border)"}`,
                  color: isSelected ? "var(--p-text)" : "var(--p-text-3)",
                }}
              >
                {label}
                <span className="tabular-nums" style={{ color: "var(--p-text-3)" }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {groups.length === 0 && (
          <p className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--p-text-3)" }}>
            施策はありません。
          </p>
        )}
        {groups.map((g) => (
          <div key={g.status} className="py-1">
            <div className="flex items-center gap-2 px-4 py-[7px]">
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: STATUS_META[g.status].tone }} />
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--p-text-2)" }}
              >
                {STATUS_META[g.status].label}
              </span>
              <span className="tabular-nums text-[11px]" style={{ color: "var(--p-text-3)" }}>
                {g.items.length}
              </span>
            </div>
            {g.items.map((p) => {
              const isActive = p.id === activeId;
              const cardKind = kindOf(p);
              const CardKindIcon = KIND_ICON[cardKind];
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openDetail(p.id)}
                  className="relative flex w-full flex-col gap-1.5 px-4 py-[11px] text-left transition-colors"
                  style={{ background: isActive ? "var(--p-bg-raised)" : "transparent" }}
                >
                  {isActive && (
                    <span
                      className="absolute inset-y-1 left-0 w-[3px] rounded-full"
                      style={{ background: "var(--p-accent)" }}
                    />
                  )}
                  {/* 種別 chip(タイトル行の前) */}
                  <span
                    className="inline-flex items-center gap-1 self-start text-[11px] font-medium"
                    style={{ color: KIND_META[cardKind].tone }}
                  >
                    <CardKindIcon size={12} /> {KIND_META[cardKind].label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-medium">{p.title}</span>
                  </span>
                  {p.subtitle && (
                    <span
                      className="self-start rounded-full px-2 py-[1px] text-[10.5px]"
                      style={{ background: "var(--p-bg-active)", color: "var(--p-text-3)" }}
                    >
                      {p.subtitle}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div
        className={`${showDetailMobile ? "block" : "hidden lg:block"} min-w-0 flex-1 overflow-y-auto`}
        style={{ background: "var(--p-bg)" }}
      >
        {!active ? (
          <p className="flex h-full items-center justify-center text-[13px]" style={{ color: "var(--p-text-3)" }}>
            施策を選んでください
          </p>
        ) : (
          <ProposalDetail
            item={active}
            kind={kindOf(active)}
            status={statusOf(active, decided)}
            onApprove={() => {
              onApprove(active);
              setShowDetailMobile(false);
            }}
            onReopen={() => {
              onReopen(active);
              setShowDetailMobile(false);
            }}
            onReject={() => {
              onReject(active);
              setShowDetailMobile(false);
            }}
            onBack={() => setShowDetailMobile(false)}
          />
        )}
      </div>
    </section>
  );
}

interface ProposalDetailProps {
  item: PendingItem;
  kind: ProposalKind;
  status: ProposalTriageStatus;
  onApprove: () => void;
  onReopen: () => void;
  onReject: () => void;
  onBack: () => void;
}

function ProposalDetail({ item, kind, status, onApprove, onReopen, onReject, onBack }: ProposalDetailProps) {
  const DetailKindIcon = KIND_ICON[kind];
  const outcome = approveOutcomeFor(kind);
  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.16 }}
      className="flex h-full flex-col"
    >
      <div className="px-6 pt-5 pb-3" style={{ borderBottom: "1px solid var(--p-border)" }}>
        <div className="mb-2.5 lg:hidden">
          <button type="button" onClick={onBack} className="proto-btn-ghost" aria-label="施策一覧へ戻る">
            <IconArrowLeft size={14} /> 施策一覧
          </button>
        </div>
        {/* 詳細ヘッダに種別 chip を先頭追加 */}
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium"
          style={{ color: KIND_META[kind].tone }}
        >
          <DetailKindIcon size={12} /> {KIND_META[kind].label}
        </span>
        {item.subtitle && (
          <span
            className="ml-2 rounded-full px-2.5 py-[3px] text-[12px] font-medium"
            style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}
          >
            {item.subtitle}
          </span>
        )}
        <h1 className="mt-3 text-[19px] font-semibold leading-snug tracking-tight">{item.title}</h1>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        <ProposalDetailBody item={item} kind={kind} />
      </div>

      <footer
        className="px-6 py-3.5"
        style={{ borderTop: "1px solid var(--p-border)", background: "var(--p-bg-elevated)" }}
      >
        {status === "rejected" ? (
          <button type="button" onClick={onReopen} className="proto-btn-ghost">
            未処理に戻す
          </button>
        ) : status === "adopted" ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-green)" }}>
              <IconCheck size={13} /> {outcome.done}
            </div>
            <button type="button" onClick={onReopen} className="proto-btn-ghost self-start">
              未処理に戻す
            </button>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* 結末プレビュー行 */}
            <div className="mb-2.5 flex items-center gap-1.5 text-[12px]" style={{ color: "var(--p-text-3)" }}>
              <span style={{ color: KIND_META[kind].tone, display: "inline-flex" }}>
                <DetailKindIcon size={13} />
              </span>
              承認すると <span style={{ color: KIND_META[kind].tone }}>{outcome.preview}</span> へ
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onReject}
                className="proto-btn-ghost"
                style={{ color: "var(--p-red)" }}
                aria-label={`却下: ${item.title}`}
              >
                <IconX size={14} /> 却下
              </button>
              <button
                type="button"
                onClick={onApprove}
                aria-label={`承認: ${item.title}`}
                className="proto-btn-primary ml-auto flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold sm:w-auto sm:justify-start"
                style={{ background: "var(--p-accent)", color: "var(--p-accent-ink)" }}
              >
                <IconCheck size={15} /> {outcome.buttonLabel} <IconArrowRight size={14} />
              </button>
            </div>
          </div>
        )}
      </footer>
    </motion.div>
  );
}
