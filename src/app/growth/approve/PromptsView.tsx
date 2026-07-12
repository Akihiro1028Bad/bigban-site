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
import { useEffect, useState, type MouseEvent } from "react";

import { fetchPrompts } from "./api";
import { extractPromptHeadings, renderPromptMarkdown } from "./promptMarkdown";
import { IconArrowLeft, IconFileText } from "./ui/icons";

// 前提情報(facility-context)を選択中であることを表す擬似キー(フェーズのファイル名とは衝突しない)。
const FACILITY_KEY = "scripts/growth/facility-context.json";

interface PromptsViewProps {
  token: string;
  query: string;
}

interface SelectableItem {
  path: string;
  label: string;
  content: string;
  meta: string;
  group: string;
  purpose: string;
  stage: string;
  // 前提情報(facility-context.json)は JSON なので生表示、フェーズプロンプト(*.md)は Markdown 整形。
  kind: "markdown" | "json";
}

function initialDocPathFromUrl(): string | null {
  /* istanbul ignore next -- @preserve SSR 専用パス: jsdom では window 常在のため到達不可 */
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("doc");
}

function initialDisplayModeFromUrl(): "rendered" | "raw" {
  /* istanbul ignore next -- @preserve SSR 専用パス: jsdom では window 常在のため到達不可 */
  if (typeof window === "undefined") return "rendered";
  return new URLSearchParams(window.location.search).get("raw") === "1" ? "raw" : "rendered";
}

function initialHashFromUrl(): string {
  /* istanbul ignore next -- @preserve SSR 専用パス: jsdom では window 常在のため到達不可 */
  if (typeof window === "undefined") return "";
  return window.location.hash;
}

function buildDocUrl(pathname: string, targetHref?: string): URL {
  const url = targetHref
    ? new URL(targetHref, window.location.origin)
    : new URL(window.location.href);
  url.searchParams.set("doc", pathname);
  if (!targetHref) url.hash = "";
  return url;
}

function pushDocParam(pathname: string, targetHref?: string): URL {
  const url = buildDocUrl(pathname, targetHref);
  const nextLocation = `${url.pathname}${url.search}${url.hash}`;
  const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextLocation !== currentLocation) {
    window.history.pushState(null, "", nextLocation);
  }
  return url;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function matchesQuery(item: SelectableItem, query: string): boolean {
  if (query === "") return true;
  const haystack = `${item.label} ${item.path} ${item.meta} ${item.purpose} ${item.stage} ${item.content}`.toLowerCase();
  return haystack.includes(query);
}

export function PromptsView({ token, query }: PromptsViewProps) {
  const { data, status, error } = useQuery({
    queryKey: ["growth-prompts", token],
    queryFn: () => fetchPrompts(token),
  });
  const [selectedPath, setSelectedPath] = useState<string | null>(initialDocPathFromUrl);
  // null は「まだカテゴリを操作していない」。初期URL復元時だけ選択資料のgroupから表示カテゴリを導出する。
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [displayMode, setDisplayMode] = useState<"rendered" | "raw">(initialDisplayModeFromUrl);
  const [activeHash, setActiveHash] = useState(initialHashFromUrl);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  // 狭幅(lg未満)の1ペイン制御: 一覧で項目を選ぶと詳細へ、戻るで一覧へ。lg以上は常に両ペイン。
  const [showDetailMobile, setShowDetailMobile] = useState(
    () => initialDocPathFromUrl() !== null,
  );

  useEffect(() => {
    function handlePopState(): void {
      const params = new URLSearchParams(window.location.search);
      const docPath = params.get("doc");
      setSelectedPath(docPath);
      setDisplayMode(params.get("raw") === "1" ? "raw" : "rendered");
      setActiveHash(window.location.hash);
      setShowDetailMobile(docPath !== null);
      if (!docPath || !data) return;
      const group = data.groups.find((candidate) =>
        candidate.phases.some((phase) => phase.path === docPath),
      );
      if (group) setActiveGroup(group.group);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [data]);

  useEffect(() => {
    if (!data || !selectedPath || displayMode !== "rendered" || activeHash === "") return;
    let headingId: string;
    try {
      headingId = decodeURIComponent(activeHash.slice(1));
    } catch {
      return;
    }
    /* istanbul ignore next -- 空fragmentはlocation.hash自体が空になり上のguardで除外済み */
    if (headingId === "") return;
    const heading = document.getElementById(headingId);
    heading?.scrollIntoView?.({ block: "start" });
  }, [activeHash, data, displayMode, selectedPath]);

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
          path: FACILITY_KEY,
          label: "前提情報",
          content: data.facilityContext,
          meta: "全フェーズ共通の前提(facility-context.json)。下書きの冒頭で正典として注入されます。",
          group: "ピン留め",
          purpose: "施設の現況、確定事実、書いてはいけない未確定情報を定義する単一ソース",
          stage: "全工程",
          kind: "json",
        }
      : null;

  const phaseItems: SelectableItem[] = data.groups.flatMap((g) =>
    g.phases.map((p) => ({
      path: p.path,
      label: p.label,
      content: p.content,
      meta: p.whenItRuns,
      group: g.group,
      purpose: p.purpose,
      stage: p.stage,
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

  const selected = allItems.find((i) => i.path === selectedPath) ?? allItems[0];
  const registeredPaths = new Set(phaseItems.map((item) => item.path));
  const normalizedQuery = normalizeQuery(query);
  const filteredGroups = data.groups
    .map((group) => ({
      group: group.group,
      phases: group.phases.filter((phase) =>
        matchesQuery(
          {
            path: phase.path,
            label: phase.label,
            content: phase.content,
            meta: phase.whenItRuns,
            group: group.group,
            purpose: phase.purpose,
            stage: phase.stage,
            kind: "markdown",
          },
          normalizedQuery,
        ),
      ),
    }))
    .filter((group) => group.phases.length > 0);
  const visibleGroupName =
    activeGroup ?? (selected.kind === "markdown" ? selected.group : "実行プロンプト");
  const visibleGroups =
    normalizedQuery === ""
      ? filteredGroups.filter((group) => group.group === visibleGroupName)
      : filteredGroups;
  const groupCounts = new Map(data.groups.map((group) => [group.group, group.phases.length]));
  const headings =
    selected.kind === "markdown" && displayMode === "rendered"
      ? extractPromptHeadings(selected.content)
      : [];

  function select(pathname: string, targetHref?: string, shouldShowDetail = true): void {
    setSelectedPath(pathname);
    const next = phaseItems.find((item) => item.path === pathname);
    if (next) setActiveGroup(next.group);
    const target = pushDocParam(pathname, targetHref);
    setDisplayMode(target.searchParams.get("raw") === "1" ? "raw" : "rendered");
    setActiveHash(target.hash);
    setShowDetailMobile(shouldShowDetail);
  }

  function handleGroupChange(groupName: string): void {
    setActiveGroup(groupName);
    const first = phaseItems.find((item) => item.group === groupName)!;
    select(first.path, undefined, false);
  }

  function handleDisplayMode(nextMode: "rendered" | "raw"): void {
    const url = new URL(window.location.href);
    if (nextMode === "raw") url.searchParams.set("raw", "1");
    else url.searchParams.delete("raw");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    setDisplayMode(nextMode);
  }

  function handleCopy(): void {
    // 成功した時だけ「コピー済み」にする(失敗時に成功表示を出さない)。
    navigator.clipboard.writeText(selected.content).then(
      () => setCopiedKey(selected.path),
      () => setCopiedKey(null),
    );
  }

  function handleMarkdownClick(event: MouseEvent<HTMLDivElement>): void {
    const target = event.target;
    /* istanbul ignore next -- React のclickイベントではtargetは描画済みHTMLElement */
    if (!(target instanceof HTMLElement)) return;
    const link = target.closest<HTMLAnchorElement>("a[data-doc-path], a[data-missing-doc-path]");
    /* istanbul ignore next -- ハンドラ配下の非リンククリックは副作用なし */
    if (!link) return;
    if (link.dataset.missingDocPath) {
      event.preventDefault();
      return;
    }
    const docPath = link.dataset.docPath;
    if (!docPath || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    select(docPath, link.href);
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
            {phaseItems.length}件
          </span>
        </div>
        {data.warnings.length > 0 ? (
          <div
            role="alert"
            className="mx-3 mt-3 rounded-[10px] px-3 py-2 text-[12px] leading-relaxed"
            style={{ background: "var(--p-amber-weak)", color: "var(--p-amber)" }}
          >
            {data.warnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        ) : null}
        <div
          className="flex gap-1 overflow-x-auto px-3 py-3"
          role="group"
          aria-label="資料カテゴリ"
          style={{ borderBottom: "1px solid var(--p-border)" }}
        >
          {data.groups.map((group) => {
            const active = visibleGroupName === group.group && normalizedQuery === "";
            return (
              <button
                key={group.group}
                type="button"
                aria-pressed={active}
                onClick={() => handleGroupChange(group.group)}
                className="shrink-0 rounded-[8px] px-2.5 py-1.5 text-[12px] font-medium"
                style={{
                  background: active ? "var(--p-bg-raised)" : "var(--p-bg-input)",
                  border: "1px solid var(--p-border)",
                  color: active ? "var(--p-text)" : "var(--p-text-2)",
                }}
              >
                {group.group}{" "}
                <span style={{ color: active ? "var(--p-accent)" : "var(--p-text-3)" }}>
                  {groupCounts.get(group.group)!}
                </span>
              </button>
            );
          })}
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
              isActive={selected.path === facilityItem.path}
              onSelect={() => select(facilityItem.path)}
            />
          </section>
        ) : null}
        {visibleGroups.map((group) => (
          <section key={group.group} className="py-1">
            <div
              className="px-4 py-[7px] text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--p-text-2)" }}
            >
              {group.group}
            </div>
            {group.phases.map((phase) => (
              <ListButton
                key={phase.path}
                item={{
                  path: phase.path,
                  label: phase.label,
                  content: phase.content,
                  meta: phase.whenItRuns,
                  group: group.group,
                  purpose: phase.purpose,
                  stage: phase.stage,
                  kind: "markdown",
                }}
                isActive={selected.path === phase.path}
                onSelect={() => select(phase.path)}
              />
            ))}
          </section>
        ))}
        {visibleGroups.length === 0 ? (
          <p className="px-4 py-6 text-[13px]" style={{ color: "var(--p-text-3)" }}>
            一致する資料がありません。
          </p>
        ) : null}
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
        <div className="sticky top-0 z-10 px-5 py-4 lg:px-6" style={{ background: "var(--p-bg)", borderBottom: "1px solid var(--p-border)" }}>
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold">{selected.label}</h2>
              <p className="mt-1 break-all text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
                {selected.path}
              </p>
            </div>
            <button
              type="button"
              onClick={handleCopy}
              className="approve-btn-ghost ml-auto shrink-0"
            >
              {copiedKey === selected.path ? "コピー済み" : "コピー"}
            </button>
          </div>
          <div className="mt-3 grid gap-2 text-[13px] leading-relaxed md:grid-cols-3">
            <p style={{ color: "var(--p-text-2)" }}>
              <span className="font-semibold" style={{ color: "var(--p-text)" }}>用途: </span>
              {selected.purpose}
            </p>
            <p style={{ color: "var(--p-text-2)" }}>
              <span className="font-semibold" style={{ color: "var(--p-text)" }}>対象工程: </span>
              {selected.stage}
            </p>
            <p style={{ color: "var(--p-text-2)" }}>
              <span className="font-semibold" style={{ color: "var(--p-text)" }}>利用タイミング: </span>
              {selected.meta}
            </p>
          </div>
          {selected.kind === "markdown" ? (
            <div className="mt-3 flex items-center gap-2" role="group" aria-label="表示形式">
              {(["rendered", "raw"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={displayMode === mode}
                  onClick={() => handleDisplayMode(mode)}
                  className="rounded-[8px] px-3 py-1.5 text-[12.5px] font-medium"
                  style={{
                    background: displayMode === mode ? "var(--p-bg-raised)" : "var(--p-bg-input)",
                    border: "1px solid var(--p-border)",
                    color: displayMode === mode ? "var(--p-text)" : "var(--p-text-2)",
                  }}
                >
                  {mode === "rendered" ? "Rendered" : "Raw"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="px-5 py-5 lg:px-6">
          {headings.length > 0 ? (
            <nav
              aria-label="目次"
              className="mb-4 max-w-[860px] rounded-[10px] px-3 py-2 text-[13px] leading-relaxed"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
            >
              <div className="mb-1 font-semibold">目次</div>
              {headings.map((heading) => (
                <a
                  key={heading.id}
                  href={`#${heading.id}`}
                  className={`block py-1 ${heading.level === 3 ? "pl-4" : ""}`}
                  style={{ color: "var(--p-text-2)" }}
                >
                  {heading.text}
                </a>
              ))}
            </nav>
          ) : null}
          {selected.kind === "json" ? (
            <pre
              className="max-w-[860px] whitespace-pre-wrap break-words rounded-[12px] p-4 text-[14px] leading-7"
              style={{
                background: "var(--p-bg-input)",
                border: "1px solid var(--p-border)",
                color: "var(--p-text-2)",
                fontFamily: "var(--p-mono)",
              }}
            >
              {selected.content}
            </pre>
          ) : displayMode === "raw" ? (
            <pre
              className="max-w-[860px] whitespace-pre-wrap break-words rounded-[12px] p-4 text-[14px] leading-7"
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
              className="prompt-markdown max-w-[860px]"
              onClick={handleMarkdownClick}
              // Markdown を整形表示。生 HTML タグはエスケープ済み(promptMarkdown で DOMPurify 通し済み)。
              dangerouslySetInnerHTML={{
                __html: renderPromptMarkdown(selected.content, {
                  currentPath: selected.path,
                  registeredPaths,
                }),
              }}
            />
          )}
          <p className="mt-4 text-[12px]" style={{ color: "var(--p-text-3)" }}>
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
        {item.path}
      </span>
    </button>
  );
}
