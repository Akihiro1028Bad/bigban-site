/**
 * 施策詳細の本体(#P5a・proto 移植): proposalKind で中段だけ差し替える。
 * ヘッダ/フッタ/却下理由は後続 ProposalView(T4)側。ここは種別ルーティングと本体表示のみ。
 *
 * - article: 既存 HypothesisCard が読む仮説6項目(記事タイプ/狙う読者/検索意図/勝ち筋/成功指標/想定CTA)を
 *   PendingItem.hypothesis の実データから proto の仮説グリッド見た目で表示。空項目は出さない(欠落耐性)。
 * - site/event/other: 本番データに詳細フィールドが無いため縮約。種別ラベル + メモ(subtitle)のみ。
 *   詳細フィールド欄はダミーを出さない(欠落耐性)。
 */

import { KIND_META } from "@/lib/growth/proposalKind";

import type { PendingItem, ProposalKind } from "./types";
import type { ArticleHypothesis } from "@/lib/growth/approve";
import type { ReactElement } from "react";

import { IconBolt, IconCalendar, IconFileText, IconLayout } from "./ui/icons";

/** 種別→アイコン(JSX は純ロジックの proposalKind.ts に置けないため UI 側で保持)。 */
export const KIND_ICON: Record<ProposalKind, (props: { size?: number }) => ReactElement> = {
  article: IconFileText,
  site: IconLayout,
  event: IconCalendar,
  other: IconBolt,
} as const;

interface ProposalDetailBodyProps {
  item: PendingItem;
  kind: ProposalKind;
}

interface FieldProps {
  label: string;
  value: string;
}

function Field({ label, value }: FieldProps): ReactElement {
  return (
    <div>
      <div className="text-[10.5px]" style={{ color: "var(--p-text-3)" }}>
        {label}
      </div>
      <div className="mt-[1px] text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
        {value}
      </div>
    </div>
  );
}

/** article の仮説グリッド行。空文字/空配列は除外して null を返す(欠落耐性)。 */
function hypothesisFields(hypothesis: ArticleHypothesis): FieldProps[] {
  const cta = hypothesis.plannedCta.join(" / ");
  const candidates: FieldProps[] = [
    { label: "記事タイプ", value: hypothesis.articleType },
    { label: "狙う読者", value: hypothesis.targetReader },
    { label: "検索意図", value: hypothesis.searchIntent },
    { label: "勝ち筋", value: hypothesis.winningAngle },
    { label: "成功指標", value: hypothesis.successMetric },
    { label: "想定CTA", value: cta },
  ];
  return candidates.filter((field) => field.value !== "");
}

/** 非 article 種別の縮約表示: 種別ラベル + メモ(あれば)のみ。 */
function CompactBody({ item, kind }: { item: PendingItem; kind: ProposalKind }): ReactElement {
  const note = item.subtitle.trim();
  return (
    <div className="flex flex-col gap-3">
      <Field label="種別" value={KIND_META[kind].label} />
      {note !== "" && <Field label="メモ" value={note} />}
    </div>
  );
}

export function ProposalDetailBody({ item, kind }: ProposalDetailBodyProps): ReactElement | null {
  if (kind === "article") {
    if (!item.hypothesis) {
      return null;
    }
    const fields = hypothesisFields(item.hypothesis);
    if (fields.length === 0) {
      return null;
    }
    return (
      <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {fields.map((field) => (
          <Field key={field.label} label={field.label} value={field.value} />
        ))}
      </div>
    );
  }

  return <CompactBody item={item} kind={kind} />;
}
