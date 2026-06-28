/**
 * プロンプト確認タブ(read-only)。各フェーズで AI に渡している静的プロンプトと、全フェーズ
 * 共通の前提情報(facility-context)を master-detail で確認する。データは GET /api/growth/prompts。
 *
 * - 左: 前提情報をピン留め＋フェーズをパイプライン順(グループ)で一覧。
 * - 右: 選択中の全文(等幅)＋「いつ動くか」＋コピー。表示はデプロイ時点のリポジトリ内容。
 * - 編集はしない(将来対応を見据え、右ペインを差し替えられる構造にしている)。
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { fetchPrompts } from "./api";

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
}

export function PromptsView({ token }: PromptsViewProps) {
  const { data, status, error } = useQuery({
    queryKey: ["growth-prompts", token],
    queryFn: () => fetchPrompts(token),
  });
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (status === "pending") {
    return (
      <p role="status" className="mt-4 text-sm text-gray-500">
        プロンプトを読み込み中…
      </p>
    );
  }
  if (status === "error") {
    return (
      <p role="alert" className="mt-4 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">
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
        }
      : null;

  const phaseItems: SelectableItem[] = data.groups.flatMap((g) =>
    g.phases.map((p) => ({
      key: p.filename,
      label: p.label,
      content: p.content,
      meta: p.whenItRuns,
    })),
  );

  const allItems: SelectableItem[] = facilityItem ? [facilityItem, ...phaseItems] : phaseItems;

  if (allItems.length === 0) {
    return (
      <p className="mt-4 text-sm text-gray-500">表示できるプロンプトがありません。</p>
    );
  }

  const selected = allItems.find((i) => i.key === selectedKey) ?? allItems[0];

  function handleCopy(): void {
    // 成功した時だけ「コピー済み」にする(失敗時に成功表示を出さない)。
    navigator.clipboard.writeText(selected.content).then(
      () => setCopiedKey(selected.key),
      () => setCopiedKey(null),
    );
  }

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
      <nav aria-label="プロンプト一覧" className="flex flex-col gap-1">
        {facilityItem ? (
          <ListButton
            item={facilityItem}
            isActive={selected.key === facilityItem.key}
            onSelect={() => setSelectedKey(facilityItem.key)}
            pinned
          />
        ) : null}
        {data.groups.map((group) => (
          <div key={group.group} className="mt-2">
            <p className="px-1 pb-1 text-xs font-medium text-gray-400">{group.group}</p>
            <div className="flex flex-col gap-1">
              {group.phases.map((phase) => (
                <ListButton
                  key={phase.filename}
                  item={{
                    key: phase.filename,
                    label: phase.label,
                    content: phase.content,
                    meta: phase.whenItRuns,
                  }}
                  isActive={selected.key === phase.filename}
                  onSelect={() => setSelectedKey(phase.filename)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <section
        aria-label="プロンプト本文"
        className="rounded-lg border border-gray-200 bg-white p-4"
      >
        <div className="flex items-start gap-2">
          <div>
            <h3 className="text-base font-medium text-gray-900">{selected.label}</h3>
            <p className="mt-1 text-xs text-gray-500">{selected.meta}</p>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className="ml-auto min-h-11 shrink-0 rounded-md border border-gray-200 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            {copiedKey === selected.key ? "コピー済み" : "コピー"}
          </button>
        </div>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-gray-700">
          {selected.content}
        </pre>
        <p className="mt-3 text-xs text-gray-400">
          読み取り専用 ・ デプロイ時点のリポジトリ内容です
        </p>
      </section>
    </div>
  );
}

interface ListButtonProps {
  item: SelectableItem;
  isActive: boolean;
  onSelect: () => void;
  pinned?: boolean;
}

function ListButton({ item, isActive, onSelect, pinned = false }: ListButtonProps) {
  const base =
    "min-h-11 rounded-md px-3 text-left text-sm transition-colors flex items-center gap-2";
  const tone = isActive
    ? "bg-white font-medium text-gray-900 ring-1 ring-gray-300"
    : pinned
      ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
      : "text-gray-600 hover:bg-gray-100";
  return (
    <button
      type="button"
      aria-pressed={isActive}
      onClick={onSelect}
      className={`${base} ${tone}`}
    >
      {item.label}
    </button>
  );
}
