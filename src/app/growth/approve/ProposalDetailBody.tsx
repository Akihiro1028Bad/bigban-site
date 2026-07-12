/**
 * 施策詳細の本体(#P5a・proto 移植): proposalKind で中段だけ差し替える。
 * ヘッダ/フッタ/却下理由は後続 ProposalView(T4)側。ここは種別ルーティングと本体表示のみ。
 *
 * - article: 既存 HypothesisCard が読む仮説6項目(記事タイプ/狙う読者/検索意図/勝ち筋/成功指標/想定CTA)を
 *   PendingItem.hypothesis の実データから proto の仮説グリッド見た目で表示。空項目は出さない(欠落耐性)。
 * - site/event/other: 既存 details / 施策仮説 / category から、承認前に判断できる材料と
 *   承認後の人間アクションを表示する。DB 追加はせず、空欄は出さない(欠落耐性)。
 */
"use client";

import { useEffect, useState } from "react";

import { KIND_META, approveOutcomeFor } from "@/lib/growth/proposalKind";

import { fetchProposalArtifact } from "./api";
import { IconArrowRight, IconBolt, IconCalendar, IconFileText, IconLayout } from "./ui/icons";
import type { ArticleHypothesis } from "@/lib/growth/approve";
import type { ReactElement, ReactNode } from "react";
import type { ProposalArtifactBlock } from "./api";
import type { PendingItem, ProposalKind } from "./types";

/** 種別→アイコン(JSX は純ロジックの proposalKind.ts に置けないため UI 側で保持)。 */
export const KIND_ICON: Record<ProposalKind, (props: { size?: number }) => ReactElement> = {
  article: IconFileText,
  site: IconLayout,
  event: IconCalendar,
  other: IconBolt,
  system: IconBolt,
} as const;

interface ProposalDetailBodyProps {
  item: PendingItem;
  kind: ProposalKind;
  token?: string;
}

type ArtifactPreviewStatus = "idle" | "loading" | "ready" | "empty" | "error";

interface ArtifactPreviewState {
  key: string | null;
  blocks: ProposalArtifactBlock[];
  status: Exclude<ArtifactPreviewStatus, "loading">;
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

interface SectionProps {
  title: string;
  children: ReactNode;
}

function DetailSection({ title, children }: SectionProps): ReactElement {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-[12px] font-semibold" style={{ color: "var(--p-text)" }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function FieldGrid({ fields }: { fields: readonly FieldProps[] }): ReactElement {
  return (
    <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
      {fields.map((field) => (
        <Field key={field.label} label={field.label} value={field.value} />
      ))}
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

function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));
}

function proposalHypothesisFields(item: PendingItem): FieldProps[] {
  const h = item.proposalHypothesis;
  if (!h) return [];
  return [
    { label: "狙い", value: h.hypothesis },
    { label: "成功条件", value: h.successMetric },
    { label: "検証予定", value: h.reviewAtMs === null ? "" : formatDate(h.reviewAtMs) },
  ].filter((field) => field.value !== "");
}

function artifactFields(item: PendingItem): FieldProps[] {
  return [
    { label: "状態", value: "成果物化済み" },
    { label: "承認日時", value: item.approvedAtMs == null ? "" : formatDate(item.approvedAtMs) },
  ].filter((field) => field.value !== "");
}

function nextActionFor(category: string, kind: ProposalKind): string {
  switch (category) {
    case "MEO":
      return "GBP投稿文案・口コミ返信・プロフィール改善案を確認し、投稿または反映する。";
    case "サイト表示内容":
      return "Before/After 文言を確認し、採用する文言をサイトへ反映する。";
    case "サイトデザイン":
      return "改善仕様書を確認し、変更箇所と優先度を実装タスクへ落とす。";
    case "追加機能":
      return "目的・要件・計測方法を確認し、実装可否と着手順を決める。";
    case "イベント":
      return "企画内容を確認し、日程・対象・告知方法・当日の運用を決める。";
    case "システム改善":
      return "Notion本文の diff案・要件案を確認し、実装タスク化するか、次の開発スコープへ入れる。";
    case "コンテンツ":
      return "記事化後の下書きを確認し、公開キューへ進める。";
    default:
      return kind === "article"
        ? "記事化後の下書きを確認し、公開キューへ進める。"
        : "成果物化された文案・仕様を確認し、実行担当と反映方法を決める。";
  }
}

function ArtifactBlockView({ block }: { block: ProposalArtifactBlock }): ReactElement {
  if (block.type === "heading_1" || block.type === "heading_2" || block.type === "heading_3") {
    return (
      <h3 className="text-[13px] font-semibold leading-relaxed" style={{ color: "var(--p-text)" }}>
        {block.text}
      </h3>
    );
  }
  if (block.type === "bulleted_list_item") {
    return (
      <ul className="ml-4 list-disc text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
        <li>{block.text}</li>
      </ul>
    );
  }
  if (block.type === "numbered_list_item") {
    return (
      <ol className="ml-4 list-decimal text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
        <li>{block.text}</li>
      </ol>
    );
  }
  if (block.type === "quote") {
    return (
      <blockquote
        className="border-l-2 pl-3 text-[12.5px] leading-relaxed"
        style={{ borderColor: "var(--p-border)", color: "var(--p-text-2)" }}
      >
        {block.text}
      </blockquote>
    );
  }
  return (
    <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
      {block.text}
    </p>
  );
}

function ArtifactPreview({ pageId, token }: { pageId: string; token?: string }): ReactElement | null {
  const requestKey = token === undefined ? null : pageId;
  const [state, setState] = useState<ArtifactPreviewState>({
    key: null,
    blocks: [],
    status: "idle",
  });
  const view =
    requestKey === null
      ? { blocks: [] as ProposalArtifactBlock[], status: "idle" as ArtifactPreviewStatus }
      : state.key === requestKey
        ? state
        : { blocks: [] as ProposalArtifactBlock[], status: "loading" as ArtifactPreviewStatus };

  useEffect(() => {
    if (token === undefined || requestKey === null) return;
    let isActive = true;
    fetchProposalArtifact(token, pageId)
      .then((nextBlocks) => {
        if (!isActive) return;
        setState({
          key: requestKey,
          blocks: nextBlocks,
          status: nextBlocks.length > 0 ? "ready" : "empty",
        });
      })
      .catch(() => {
        if (!isActive) return;
        setState({ key: requestKey, blocks: [], status: "error" });
      });
    return () => {
      isActive = false;
    };
  }, [pageId, requestKey, token]);

  if (view.status === "idle") return null;
  if (view.status === "loading") {
    return (
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
        成果物を読み込み中...
      </p>
    );
  }
  if (view.status === "error") {
    return (
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-red)" }}>
        成果物を読み込めませんでした。Notionリンクから確認してください。
      </p>
    );
  }
  if (view.status === "empty") {
    return (
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
        Notion本文に表示できる成果物がありません。
      </p>
    );
  }
  return (
    <div
      className="flex max-h-[360px] flex-col gap-2 overflow-y-auto rounded-[10px] px-3 py-3"
      style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
    >
      {view.blocks.map((block) => (
        <ArtifactBlockView key={block.id} block={block} />
      ))}
    </div>
  );
}

function ArtifactSection({ item, token }: { item: PendingItem; token?: string }): ReactElement | null {
  if (item.stage !== "completed") return null;
  const fields = artifactFields(item);
  return (
    <DetailSection title="成果物">
      {fields.length > 0 && <FieldGrid fields={fields} />}
      <ArtifactPreview pageId={item.id} token={token} />
      {item.artifactUrl ? (
        <a
          href={item.artifactUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex self-start rounded-[10px] px-3 py-2 text-[12.5px] font-semibold"
          style={{ background: "var(--p-bg-active)", color: "var(--p-text)", border: "1px solid var(--p-border)" }}
        >
          Notionで成果物を開く
        </a>
      ) : (
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
          成果物リンクは未記録です。Notion の施策ページ本文を確認してください。
        </p>
      )}
    </DetailSection>
  );
}

function ProposalFlow({ kind }: { kind: ProposalKind }): ReactElement {
  const outcome = approveOutcomeFor(kind);
  return (
    <DetailSection title="承認後の流れ">
      <div
        className="flex flex-col gap-2 rounded-[10px] px-3 py-3"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
          <span className="font-medium" style={{ color: KIND_META[kind].tone }}>
            {outcome.preview}
          </span>
          <IconArrowRight size={13} />
          <span>Notion本文の成果物</span>
        </div>
        <p className="text-[12px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
          承認後は施策実行モードが対象施策を拾い、カテゴリに応じた文案・仕様・企画メモを Notion 本文に作成します。
        </p>
      </div>
    </DetailSection>
  );
}

export function ProposalDetailBody({ item, kind, token }: ProposalDetailBodyProps): ReactElement | null {
  const category = item.subtitle.trim();
  const categoryFields: FieldProps[] = [
    { label: "種別", value: KIND_META[kind].label },
    { label: "カテゴリ", value: category },
  ].filter((field) => field.value !== "");
  const detailFields = item.details ?? [];
  const proposalFields = proposalHypothesisFields(item);

  if (kind === "article") {
    return (
      <div className="flex flex-col gap-5">
        {categoryFields.length > 0 && (
          <DetailSection title="分類">
            <FieldGrid fields={categoryFields} />
          </DetailSection>
        )}
        {item.hypothesis ? (
          <DetailSection title="記事の狙い">
            <FieldGrid fields={hypothesisFields(item.hypothesis)} />
          </DetailSection>
        ) : null}
        {detailFields.length > 0 && (
          <DetailSection title="判断材料">
            <FieldGrid fields={detailFields} />
          </DetailSection>
        )}
        {proposalFields.length > 0 && (
          <DetailSection title="狙いと検証">
            <FieldGrid fields={proposalFields} />
          </DetailSection>
        )}
        <ArtifactSection item={item} token={token} />
        <ProposalFlow kind={kind} />
        <DetailSection title="次にやること">
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
            {nextActionFor(category, kind)}
          </p>
        </DetailSection>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {categoryFields.length > 0 && (
        <DetailSection title="分類">
          <FieldGrid fields={categoryFields} />
        </DetailSection>
      )}
      {detailFields.length > 0 && (
        <DetailSection title="判断材料">
          <FieldGrid fields={detailFields} />
        </DetailSection>
      )}
      {proposalFields.length > 0 && (
        <DetailSection title="狙いと検証">
          <FieldGrid fields={proposalFields} />
        </DetailSection>
      )}
      <ArtifactSection item={item} token={token} />
      <ProposalFlow kind={kind} />
      <DetailSection title="次にやること">
        <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
          {nextActionFor(category, kind)}
        </p>
      </DetailSection>
    </div>
  );
}
