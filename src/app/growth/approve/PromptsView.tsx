/**
 * プロンプト確認タブ(read-only)。各フェーズで AI に渡している静的プロンプトと、全フェーズ
 * 共通の前提情報(facility-context)を proto ダーク master-detail で確認する。
 * データは GET /api/growth/prompts。
 *
 * - 左 nav: 前提情報をピン留め＋フェーズをパイプライン順(グループ)で一覧。
 *   アクティブ項目は左バー(w-[3px])＋ raised 背景で示す。
 * - 右 section: 選択中の全文(等幅)＋「いつ動くか」＋コピー。表示はデプロイ時点のリポジトリ内容。
 * - モバイル(lg 未満)は 1 ペイン: 項目を選ぶと詳細へ、戻るで一覧へ(showDetailMobile)。
 * - 編集はしない(将来対応を見据え、右ペインを差し替えられる構造にしている)。
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchPrompts } from "./api";
import { renderPromptMarkdown } from "./promptMarkdown";
import { IconArrowLeft, IconFileText } from "./ui/icons";

// 前提情報(facility-context)を選択中であることを表す擬似キー(フェーズのファイル名とは衝突しない)。
const FACILITY_KEY = "__facility__";

interface PromptsViewProps {
  token: string;
}

interface SelectableItem {
  key: string;
  label: string;
  content: string;
  meta: string;
  // 前提情報(facility-context.json)は JSON なので生表示、フェーズプロンプト(*.md)は Markdown 整形。
  kind: "markdown" | "json";
}

export function PromptsView({ token }: PromptsViewProps) {
  const { data, status, error } = useQuery({
    queryKey: ["growth-prompts", token],
    queryFn: () => fetchPrompts(token),
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 狭幅(lg未満)の1ペイン制御: 一覧で項目を選ぶと詳細へ、戻るで一覧へ。lg以上は常に両ペイン。
  const [showDetailMobile, setShowDetailMobile] = useState(false);

  if (status === "pending") {
    return (
      <p role="status" className="mt-4 px-4 text-[13px]" style={{ color: "var(--p-text-3)" }}>
        プロンプトを読み込み中…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p
        role="alert"
        className="mt-4 mx-4 rounded-[10px] px-3 py-2 text-[13px]"
        style={{ background: "var(--p-red-weak)", color: "var(--p-red)" }}
      >
        {error instanceof Error ? error.message : "取得に失敗しました。"}
      </p>
    );
  }

  const facilityItem: SelectableItem | null =
    data.facilityContext !== null
      ? {
          key: FACILITY_KEY,
          label: "前提情報",
          content: data.facilityContext,
          meta: "全フェーズ共通の前提(facility-context.json)。下書きの冒頭で正典として注入されます。",
          kind: "json",
        }
      : null;

  const phaseItems: SelectableItem[] = data.groups.flatMap((g) =>
    g.phases.map((p) => ({
      key: p.filename,
      label: p.label,
      content: p.content,
      meta: p.whenItRuns,
      kind: "markdown",
    })),
  );

  const allItems: SelectableItem[] = facilityItem ? [facilityItem, ...phaseItems] : phaseItems;

  if (allItems.length === 0) {
    return (
      <p className="mt-4 px-4 text-[13px]" style={{ color: "var(--p-text-3)" }}>
        表示できるプロンプトがありません。
      </p>
    );
  }

  const selected = allItems.find((i) => i.key === selectedKey) ?? allItems[0];

  function select(key: string): void {
    setSelectedKey(key);
    setShowDetailMobile(true);
  }

  function handleCopy(): void {
    // 成功した時だけ「コピー済み」にする(失敗時に成功表示を出さない)。
    navigator.clipboard.writeText(selected.content).then(
      () => setCopiedKey(selected.key),
      () => setCopiedKey(null),
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <nav
        aria-label="プロンプト一覧"
        className={`${showDetailMobile ? "hidden lg:block" : "block"} w-full overflow-y-auto lg:w-[34%] lg:min-w-[280px] lg:max-w-[420px]`}
        style={{ borderRight: "1px solid var(--p-border)" }}
      >
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: "1px solid var(--p-border)" }}
        >
          <IconFileText size={16} style={{ color: "var(--p-accent)" }} />
          <span className="text-[14px] font-semibold">プロンプト</span>
          <span className="ml-auto text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
            実テンプレ全文
          </span>
        </div>
        {facilityItem ? (
          <section className="py-1">
            <div
              className="px-4 py-[7px] text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--p-text-2)" }}
            >
              前提情報（ピン留め）
            </div>
            <ListButton
              item={facilityItem}
              isActive={selected.key === facilityItem.key}
              onSelect={() => select(facilityItem.key)}
            />
          </section>
        ) : null}
        {data.groups.map((group) => (
          <section key={group.group} className="py-1">
            <div
              className="px-4 py-[7px] text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--p-text-2)" }}
            >
              {group.group}
            </div>
            {group.phases.map((phase) => (
              <ListButton
                key={phase.filename}
                item={{
                  key: phase.filename,
                  label: phase.label,
                  content: phase.content,
                  meta: phase.whenItRuns,
                  kind: "markdown",
                }}
                isActive={selected.key === phase.filename}
                onSelect={() => select(phase.filename)}
              />
            ))}
          </section>
        ))}
      </nav>

      <section
        aria-label="プロンプト本文"
        className={`${showDetailMobile ? "block" : "hidden lg:block"} min-w-0 flex-1 overflow-y-auto`}
        style={{ background: "var(--p-bg)" }}
      >
        {/* approve-btn-ghost の display 指定が Tailwind の hidden を上書きするため、ラッパ div 側で lg 以上は非表示にする。 */}
        <div className="px-6 pt-4 lg:hidden">
          <button
            type="button"
            onClick={() => setShowDetailMobile(false)}
            className="approve-btn-ghost"
            aria-label="プロンプト一覧へ戻る"
          >
            <IconArrowLeft size={14} /> 一覧
          </button>
        </div>
        <div className="px-6 py-5">
          <div className="mb-2 flex items-start gap-2">
            <div className="min-w-0">
              <h3 className="text-[16px] font-semibold">{selected.label}</h3>
              <p className="mt-1 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
                {selected.meta}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="approve-btn-ghost ml-auto shrink-0"
            >
              {copiedKey === selected.key ? "コピー済み" : "コピー"}
            </button>
          </div>
          {selected.kind === "json" ? (
            <pre
              className="mt-3 whitespace-pre-wrap break-words rounded-[12px] p-4 text-[12.5px] leading-relaxed"
              style={{
                background: "var(--p-bg-input)",
                border: "1px solid var(--p-border)",
                color: "var(--p-text-2)",
                fontFamily: "var(--p-mono)",
              }}
            >
              {selected.content}
            </pre>
          ) : (
            <div
              className="prose prose-invert prose-sm mt-3 max-w-none"
              // Markdown を整形表示。生 HTML タグはエスケープ済み(promptMarkdown で DOMPurify 通し済み)。
              dangerouslySetInnerHTML={{ __html: renderPromptMarkdown(selected.content) }}
            />
          )}
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
            読み取り専用 ・ デプロイ時点のリポジトリ内容です
          </p>
        </div>
      </section>
    </div>
  );
}

interface ListButtonProps {
  item: SelectableItem;
  isActive: boolean;
  onSelect: () => void;
}

function ListButton({ item, isActive, onSelect }: ListButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onSelect}
      className="relative flex w-full flex-col gap-[2px] px-4 py-2.5 text-left transition-colors"
      style={{ background: isActive ? "var(--p-bg-raised)" : "transparent" }}
    >
      {isActive && (
        <span
          className="absolute inset-y-1 left-0 w-[3px] rounded-full"
          style={{ background: "var(--p-accent)" }}
        />
      )}
      <span className="text-[13px] font-medium">{item.label}</span>
      <span className="truncate text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
        {item.meta}
      </span>
    </button>
  );
}
