/**
 * 承認画面リッチUIプロトタイプ(#proto)のエントリ。
 *
 * 独立した見た目検証用。既存 /growth/approve のロジック・配線・テストには依存しない。
 * モックデータ(mockData.ts)だけで動き、外部 I/O は一切しない。
 *
 * 機能: master-detail / カンバン横並び切替 / インライン本文編集 /
 *       成績ボード・公開キュー / ブランド配色(アクセント黄)バリアント。
 */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import "./proto.css";

import { Board } from "./Board";
import { BulkBar } from "./BulkBar";
import { CommandPalette } from "./CommandPalette";
import type { Command } from "./CommandPalette";
import { DetailPanel } from "./DetailPanel";
import {
  IconCalendar,
  IconChart,
  IconCheck,
  IconEdit,
  IconLayout,
  IconList,
  IconRefresh,
  IconSparkles,
  IconWand,
} from "./icons";
import { KanbanBoard } from "./KanbanBoard";
import { LeftRail } from "./LeftRail";
import { MediaLibraryModal } from "./MediaLibraryModal";
import { MOCK_ARTICLES } from "./mockData";
import { PerformanceBoard } from "./PerformanceBoard";
import { PublishQueue } from "./PublishQueue";
import { proposeBody, proposeOutline, proposeTitle } from "./reviseMock";
import { ReviseRequestModal } from "./ReviseRequestModal";
import { ShortcutBar } from "./ShortcutBar";
import {
  BoardEmpty,
  ErrorState,
  ReviewDoneEmpty,
  SearchEmpty,
  SkeletonBoard,
  SkeletonDetail,
} from "./StateScreens";
import { ShortcutOverlay } from "./ShortcutOverlay";
import { STAGE_ORDER } from "./stages";
import { ToastStack } from "./ToastStack";
import { TopBar } from "./TopBar";
import type {
  Article,
  BoardMode,
  DetailTab,
  ImageStyle,
  MainView,
  OutlineSection,
  ReviseProposal,
  ReviseTarget,
  SegmentKey,
  Stage,
  Toast,
} from "./types";

const SEGMENTS: { key: SegmentKey; label: string; match: (a: Article) => boolean }[] = [
  { key: "all", label: "すべて", match: () => true },
  { key: "awaiting", label: "あなた待ち", match: (a) => a.awaitingYou },
  { key: "generating", label: "生成中", match: (a) => a.stage === "generating" },
  { key: "published", label: "公開済み", match: (a) => a.stage === "published" },
];

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function adjacentId(ids: string[], current: string | null, dir: 1 | -1): string | null {
  if (ids.length === 0) return null;
  if (current === null) return ids[0];
  const i = ids.indexOf(current);
  if (i === -1) return ids[0];
  const next = i + dir;
  if (next < 0 || next >= ids.length) return current;
  return ids[next];
}

/** 承認時の段階遷移(構成案→生成中 / 下書き→公開予約)。 */
function advanceStage(a: Article): Article {
  if (a.stage === "outline_review") {
    return { ...a, stage: "generating", awaitingYou: false, genProgress: 8, generatingStep: "本文を執筆中(セクション 1 / 4)" };
  }
  if (a.stage === "draft_review") {
    return { ...a, stage: "scheduled", awaitingYou: false, scheduledLabel: "次の公開枠に予約" };
  }
  return a;
}

// 生成完了時に流し込む汎用本文(モック)。
const GENERATED_BODY = `
<h2>はじめに</h2>
<p>この記事では、テーマのポイントを、はじめての方にも分かるようにまとめました。むずかしい言葉は使わず、一歩ずつ進みます。</p>
<h2>押さえておきたい3つのこと</h2>
<ul>
<li>まずは気軽に試せること</li>
<li>続けやすい仕組みがあること</li>
<li>屋内なので天候に左右されないこと</li>
</ul>
<blockquote>結論はシンプルです。まず一度、体験してみてください。</blockquote>
<h2>まとめ</h2>
<p>気になった方は、施設の紹介ページもあわせてご覧ください。</p>
`;

// 生成1ステップの進み幅。
const GEN_STEP = 16;

/** 生成中の記事を1ティック進める。100到達で下書きレビューへ。 */
function tickGenerating(a: Article): Article {
  if (a.stage !== "generating") return a;
  const next = (a.genProgress ?? 8) + GEN_STEP;
  if (next >= 100) {
    return {
      ...a,
      stage: "draft_review",
      awaitingYou: true,
      genProgress: undefined,
      generatingStep: undefined,
      updatedLabel: "たった今",
      hasEyecatch: true,
      bodyImages: a.bodyImages || 1,
      wordCount: a.wordCount || 1280,
      readMinutes: a.readMinutes || 4,
      bodyHtml: a.bodyHtml || GENERATED_BODY,
      checklist: [
        { key: "eyecatch", label: "アイキャッチ", done: true },
        { key: "body", label: "本文", done: true },
        { key: "words", label: "文字数 1,200+", done: true },
        { key: "decoration", label: "装飾", done: false },
      ],
    };
  }
  const step =
    next < 45 ? "本文を執筆中(セクション 2 / 4)" : next < 80 ? "アイキャッチを生成中" : "仕上げ中";
  return { ...a, genProgress: next, generatingStep: step };
}

export default function ApproveProtoPage() {
  const [articles, setArticles] = useState<Article[]>(MOCK_ARTICLES);
  const [view, setView] = useState<MainView>("approve");
  const [boardMode, setBoardMode] = useState<BoardMode>("list");
  const [segment, setSegment] = useState<SegmentKey>("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>("a1");
  const [tab, setTab] = useState<DetailTab>("preview");
  const [editing, setEditing] = useState(false);
  const [brand, setBrand] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [reviseModalFor, setReviseModalFor] = useState<string | null>(null);
  const [mediaTarget, setMediaTarget] = useState<{
    id: string;
    kind: "eyecatch" | "body";
    index?: number;
  } | null>(null);
  const [regenKeys, setRegenKeys] = useState<Set<string>>(new Set());
  const [adoptedFixes, setAdoptedFixes] = useState<Set<string>>(new Set());
  // #proto 状態の質: 初期読み込み / 同期 / エラー。
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [lastSyncMs, setLastSyncMs] = useState(0);
  const [nowMs, setNowMs] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const toastSeq = useRef(0);
  const reviseTimers = useRef<number[]>([]);

  const pushToast = useCallback((tone: Toast["tone"], text: string) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { id, tone, text }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const filtered = useMemo(() => {
    const seg = SEGMENTS.find((s) => s.key === segment) ?? SEGMENTS[0];
    const q = query.trim().toLowerCase();
    return articles.filter((a) => {
      if (!seg.match(a)) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.keyword.toLowerCase().includes(q) ||
        a.excerpt.toLowerCase().includes(q)
      );
    });
  }, [articles, segment, query]);

  const groups = useMemo(() => {
    const byStage = new Map<Stage, Article[]>();
    for (const a of filtered) {
      const arr = byStage.get(a.stage) ?? [];
      arr.push(a);
      byStage.set(a.stage, arr);
    }
    return STAGE_ORDER.filter((s) => byStage.has(s)).map((stage) => ({
      stage,
      items: (byStage.get(stage) ?? []).sort((x, y) => y.score - x.score),
    }));
  }, [filtered]);

  const orderedIds = useMemo(
    () => groups.flatMap((g) => g.items.map((i) => i.id)),
    [groups]
  );

  const activeArticle = useMemo(
    () => articles.find((a) => a.id === activeId) ?? null,
    [articles, activeId]
  );

  const awaitingCount = useMemo(
    () => articles.filter((a) => a.awaitingYou).length,
    [articles]
  );
  const publishedThisWeek = useMemo(
    () => articles.filter((a) => a.stage === "published").length,
    [articles]
  );

  const segmentDefs = useMemo(
    () =>
      SEGMENTS.map((s) => ({
        key: s.key,
        label: s.label,
        count: articles.filter((a) => s.match(a)).length,
      })),
    [articles]
  );

  const activate = useCallback((id: string) => {
    setEditing(false);
    setActiveId(id);
  }, []);

  const approve = useCallback(
    (id: string) => {
      const a = articles.find((x) => x.id === id);
      if (!a || (a.stage !== "outline_review" && a.stage !== "draft_review")) return;
      const goNext = adjacentId(orderedIds, id, 1);
      setArticles((prev) => prev.map((x) => (x.id === id ? advanceStage(x) : x)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      pushToast(
        "success",
        a.stage === "outline_review" ? "構成案を承認 — 生成を開始しました" : "承認 — 公開予約しました"
      );
      if (goNext && goNext !== id) activate(goNext);
    },
    [articles, orderedIds, pushToast, activate]
  );

  // 「修正を依頼」は指示を書くモーダルを開く。
  const revise = useCallback(
    (id: string) => {
      if (articles.some((x) => x.id === id)) setReviseModalFor(id);
    },
    [articles]
  );

  // 指示を送信 → requested(待ち) → 一定時間後に presenting(提示中)へ。
  const requestRevise = useCallback(
    (id: string, instruction: { title?: string; body?: string }) => {
      setArticles((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, reviseStatus: "requested", reviseInstruction: instruction, reviseProposal: undefined }
            : a
        )
      );
      setReviseModalFor(null);
      setActiveId(id);
      setTab("revise");
      pushToast("info", "修正を依頼しました — AIが案を作成します");
      const timer = window.setTimeout(() => {
        setArticles((prev) =>
          prev.map((a) => {
            if (a.id !== id) return a;
            const proposal: ReviseProposal = {};
            if (instruction.title) proposal.title = proposeTitle(a.title, instruction.title);
            if (instruction.body) proposal.body = proposeBody(a.bodyHtml, instruction.body);
            return { ...a, reviseStatus: "presenting", reviseProposal: proposal };
          })
        );
        pushToast("success", "修正案が届きました — 元 vs 新 を見比べられます");
      }, 1800);
      reviseTimers.current.push(timer);
    },
    [pushToast]
  );

  const settleRevise = useCallback(
    (id: string, target: ReviseTarget, apply: boolean) => {
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== id || !a.reviseProposal) return a;
          const proposal = a.reviseProposal;
          if (!proposal[target]) return a;
          const nextProposal: ReviseProposal = { ...proposal };
          delete nextProposal[target];
          const remaining = Object.keys(nextProposal).length > 0;
          return {
            ...a,
            title: apply && proposal.title && target === "title" ? proposal.title.to : a.title,
            bodyHtml: apply && proposal.body && target === "body" ? proposal.body.to : a.bodyHtml,
            outline: apply && proposal.outline && target === "outline" ? proposal.outline.to : a.outline,
            reviseProposal: remaining ? nextProposal : undefined,
            reviseStatus: remaining ? "presenting" : "none",
            reviseInstruction: remaining ? a.reviseInstruction : undefined,
          };
        })
      );
      if (apply) {
        const label =
          target === "title" ? "タイトル" : target === "body" ? "本文" : "構成案";
        pushToast("success", `${label}を反映しました`);
      } else {
        pushToast("info", "提案を却下しました");
      }
    },
    [pushToast]
  );

  const applyRevise = useCallback(
    (target: ReviseTarget) => {
      if (activeId) settleRevise(activeId, target, true);
    },
    [activeId, settleRevise]
  );
  const dismissRevise = useCallback(
    (target: ReviseTarget) => {
      if (activeId) settleRevise(activeId, target, false);
    },
    [activeId, settleRevise]
  );

  // 退場時に提示タイマーを掃除する。
  useEffect(() => {
    const timers = reviseTimers.current;
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  // ---- 画像(アイキャッチ/本文画像)----
  const deriveBodyHues = useCallback(
    (a: Article): number[] =>
      a.bodyImageHues ?? Array.from({ length: a.bodyImages }, (_, i) => (a.hue + (i + 1) * 50) % 360),
    []
  );

  const selectMedia = useCallback(
    (hue: number) => {
      const tgt = mediaTarget;
      if (!tgt) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== tgt.id) return a;
          if (tgt.kind === "eyecatch") return { ...a, hue, hasEyecatch: true };
          const hues = deriveBodyHues(a).slice();
          if (tgt.index != null) hues[tgt.index] = hue;
          return { ...a, bodyImageHues: hues };
        })
      );
      setMediaTarget(null);
      pushToast("success", tgt.kind === "eyecatch" ? "アイキャッチを差し替えました" : "本文画像を差し替えました");
    },
    [mediaTarget, deriveBodyHues, pushToast]
  );

  const regenImage = useCallback(
    (id: string, kind: "eyecatch" | "body", index?: number) => {
      const key = kind === "eyecatch" ? `${id}:eyecatch` : `${id}:body:${index}`;
      setRegenKeys((prev) => new Set(prev).add(key));
      pushToast("info", kind === "eyecatch" ? "アイキャッチをAIで再生成中…" : "本文画像をAIで再生成中…");
      const timer = window.setTimeout(() => {
        setArticles((prev) =>
          prev.map((a) => {
            if (a.id !== id) return a;
            if (kind === "eyecatch") return { ...a, hue: (a.hue + 73) % 360, hasEyecatch: true };
            const hues = deriveBodyHues(a).slice();
            if (index != null) hues[index] = (hues[index] + 127) % 360;
            return { ...a, bodyImageHues: hues };
          })
        );
        setRegenKeys((prev) => {
          const s = new Set(prev);
          s.delete(key);
          return s;
        });
        pushToast("success", "新しい画像に差し替えました");
      }, 1600);
      reviseTimers.current.push(timer);
    },
    [deriveBodyHues, pushToast]
  );

  // ---- アドバイスの採用→本文反映 ----
  const adoptAdvice = useCallback(
    (index: number) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => {
          if (a.id !== activeId) return a;
          const fix = a.advice.fixes[index];
          if (!fix) return a;
          return { ...a, bodyHtml: `${a.bodyHtml}<p class="proto-changed">${fix.suggestion}</p>` };
        })
      );
      setAdoptedFixes((prev) => new Set(prev).add(`${activeId}:${index}`));
      pushToast("success", "アドバイスを本文に反映しました");
    },
    [activeId, pushToast]
  );

  // ---- 構成案(行コメント・画像指示・修正依頼)----
  const updateActiveOutline = useCallback(
    (updater: (outline: OutlineSection[]) => OutlineSection[]) => {
      if (!activeId) return;
      setArticles((prev) =>
        prev.map((a) => (a.id === activeId ? { ...a, outline: updater(a.outline) } : a))
      );
    },
    [activeId]
  );

  const addOutlineComment = useCallback(
    (si: number, text: string) =>
      updateActiveOutline((o) =>
        o.map((s, i) => (i === si ? { ...s, comments: [...(s.comments ?? []), text] } : s))
      ),
    [updateActiveOutline]
  );
  const removeOutlineComment = useCallback(
    (si: number, ci: number) =>
      updateActiveOutline((o) =>
        o.map((s, i) =>
          i === si ? { ...s, comments: (s.comments ?? []).filter((_, k) => k !== ci) } : s
        )
      ),
    [updateActiveOutline]
  );
  const setImageInstruction = useCallback(
    (si: number, style: ImageStyle, description: string) =>
      updateActiveOutline((o) =>
        o.map((s, i) => (i === si ? { ...s, imageInstruction: { style, description } } : s))
      ),
    [updateActiveOutline]
  );
  const clearImageInstruction = useCallback(
    (si: number) =>
      updateActiveOutline((o) =>
        o.map((s, i) => (i === si ? { ...s, imageInstruction: undefined } : s))
      ),
    [updateActiveOutline]
  );

  const requestOutlineRevise = useCallback(() => {
    if (!activeId) return;
    const target = articles.find((x) => x.id === activeId);
    if (!target) return;
    const comments = target.outline.flatMap((s) => s.comments ?? []);
    if (comments.length === 0) return;
    const summary = comments.map((c) => `・${c}`).join("\n");
    setArticles((prev) =>
      prev.map((x) =>
        x.id === activeId
          ? { ...x, reviseStatus: "requested", reviseInstruction: { outline: summary }, reviseProposal: undefined }
          : x
      )
    );
    setTab("revise");
    pushToast("info", "構成案の修正を依頼しました — AIが案を作成します");
    const timer = window.setTimeout(() => {
      setArticles((prev) =>
        prev.map((x) => {
          if (x.id !== activeId) return x;
          const proposal: ReviseProposal = {
            outline: { from: x.outline, to: proposeOutline(x.outline) },
          };
          return { ...x, reviseStatus: "presenting", reviseProposal: proposal };
        })
      );
      pushToast("success", "構成案の修正案が届きました");
    }, 1800);
    reviseTimers.current.push(timer);
  }, [activeId, articles, pushToast]);

  // ---- 生成のライブ感: 生成中の記事を一定間隔で進め、完了で下書きへ ----
  useEffect(() => {
    const iv = window.setInterval(() => {
      setArticles((prev) =>
        prev.some((a) => a.stage === "generating") ? prev.map(tickGenerating) : prev
      );
    }, 1500);
    return () => window.clearInterval(iv);
  }, []);

  // 生成完了を検知して通知する。
  const prevGenRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const nowGen = new Set(articles.filter((a) => a.stage === "generating").map((a) => a.id));
    const prevGen = prevGenRef.current;
    articles.forEach((a) => {
      if (prevGen.has(a.id) && a.stage === "draft_review") {
        pushToast("success", `生成が完了：「${a.title.slice(0, 12)}…」`);
      }
    });
    prevGenRef.current = nowGen;
  }, [articles, pushToast]);

  const reject = useCallback(
    (id: string) => {
      const goNext = adjacentId(orderedIds, id, 1);
      setArticles((prev) => prev.filter((x) => x.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      pushToast("danger", "却下しました");
      if (goNext && goNext !== id) activate(goNext);
      else setActiveId(null);
    },
    [orderedIds, pushToast, activate]
  );

  const startEdit = useCallback(() => {
    if (!activeArticle?.bodyHtml) {
      pushToast("info", "本文が無いため編集できません");
      return;
    }
    setTab("preview");
    setEditing(true);
  }, [activeArticle, pushToast]);

  const saveEdit = useCallback(
    (html: string) => {
      if (!activeId) return;
      setArticles((prev) => prev.map((a) => (a.id === activeId ? { ...a, bodyHtml: html } : a)));
      setEditing(false);
      pushToast("success", "下書きを保存しました");
    },
    [activeId, pushToast]
  );

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const approveSelected = useCallback(() => {
    const ids = [...selectedIds];
    const count = ids.filter((id) => {
      const a = articles.find((x) => x.id === id);
      return a && (a.stage === "outline_review" || a.stage === "draft_review");
    }).length;
    setArticles((prev) =>
      prev.map((x) =>
        selectedIds.has(x.id) && (x.stage === "outline_review" || x.stage === "draft_review")
          ? advanceStage(x)
          : x
      )
    );
    setSelectedIds(new Set());
    pushToast("success", count > 0 ? `${count}件をまとめて承認しました` : "対象がありませんでした");
  }, [selectedIds, articles, pushToast]);

  const publishReady = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setArticles((prev) =>
        prev.map((a) =>
          ids.includes(a.id)
            ? { ...a, stage: "published", awaitingYou: false, scheduledLabel: undefined, scheduledAtMs: undefined }
            : a
        )
      );
      pushToast("success", `${ids.length}件を公開しました`);
    },
    [pushToast]
  );

  const scheduleArticles = useCallback(
    (ids: string[], label: string, atMs: number) => {
      if (ids.length === 0) return;
      setArticles((prev) =>
        prev.map((a) =>
          ids.includes(a.id)
            ? { ...a, stage: "scheduled", awaitingYou: false, scheduledLabel: label, scheduledAtMs: atMs }
            : a
        )
      );
      pushToast("success", `${ids.length}件を予約しました（${label}）`);
    },
    [pushToast]
  );

  const unscheduleArticle = useCallback(
    (id: string) => {
      setArticles((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, stage: "draft_review", awaitingYou: true, scheduledLabel: undefined, scheduledAtMs: undefined }
            : a
        )
      );
      pushToast("info", "予約を解除しました");
    },
    [pushToast]
  );

  const fixFromQueue = useCallback(
    (id: string, tab: DetailTab) => {
      setView("approve");
      setBoardMode("list");
      setActiveId(id);
      setTab(tab);
    },
    []
  );

  // 成績ボード → 伸びた記事から「次のネタ案」を生み、ファネル先頭へ戻す(ループを閉じる)。
  const ideaSeq = useRef(0);
  const addIdeaFromArticle = useCallback(
    (src: Article) => {
      ideaSeq.current += 1;
      const newIdea: Article = {
        id: `idea-${ideaSeq.current}`,
        title: `「${src.keyword}」の深掘り企画`,
        stage: "idea",
        score: Math.min(92, (src.score ?? 60) + 4),
        awaitingYou: false,
        updatedLabel: "たった今",
        excerpt: `成績ボードから追加。「${src.title}」が伸びたため、同じ切り口で関連テーマを企画。`,
        keyword: src.keyword,
        hue: src.hue,
        wordCount: 0,
        readMinutes: 0,
        outline: [{ heading: "関連テーマの切り口", summary: "伸びた記事と同じ検索意図を広げる" }],
        prompt: "(構成案承認後に生成)",
        refs: [],
        bodyHtml: "",
        hasEyecatch: false,
        bodyImages: 0,
        decorations: 0,
        advice: { overall: 0, scores: [], strengths: [], fixes: [] },
        checklist: [
          { key: "eyecatch", label: "アイキャッチ", done: false },
          { key: "body", label: "本文", done: false },
          { key: "words", label: "文字数 1,200+", done: false },
          { key: "decoration", label: "装飾", done: false },
        ],
      };
      setArticles((prev) => [newIdea, ...prev]);
      pushToast("success", "ネタ案に追加しました — 承認ビューのネタ案に並びます");
    },
    [pushToast]
  );

  // 初期読み込みを擬似する(スケルトン→実データ)。最終同期はやや前にしておき stale を見せる。
  useEffect(() => {
    const t = window.setTimeout(() => {
      setLoading(false);
      const now = Date.now();
      setLastSyncMs(now - 3 * 60_000);
      setNowMs(now);
    }, 900);
    return () => window.clearTimeout(t);
  }, []);

  // 相対表示(「N分前」)のための時刻ティック。
  useEffect(() => {
    const iv = window.setInterval(() => setNowMs(Date.now()), 20_000);
    return () => window.clearInterval(iv);
  }, []);

  const refreshBoard = useCallback(() => {
    setSyncing(true);
    const t = window.setTimeout(() => {
      const now = Date.now();
      setLastSyncMs(now);
      setNowMs(now);
      setSyncing(false);
    }, 700);
    reviseTimers.current.push(t);
  }, []);

  const retryLoad = useCallback(() => {
    setLoadError(false);
    setLoading(true);
    const t = window.setTimeout(() => {
      setLoading(false);
      const now = Date.now();
      setLastSyncMs(now);
      setNowMs(now);
    }, 900);
    reviseTimers.current.push(t);
  }, []);

  const minutesAgo = lastSyncMs > 0 ? Math.floor((nowMs - lastSyncMs) / 60_000) : null;
  const syncLabel =
    minutesAgo == null ? null : minutesAgo < 1 ? "たった今" : `${minutesAgo}分前`;
  const syncStale = minutesAgo != null && minutesAgo >= 2;

  // アクティブ行をリスト内に見えるようスクロール。
  useEffect(() => {
    if (view !== "approve" || boardMode !== "list" || !activeId) return;
    const el = document.querySelector(`[data-row-id="${activeId}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeId, view, boardMode]);

  // グローバルなキーボード操作。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        if (paletteOpen) return setPaletteOpen(false);
        if (shortcutsOpen) return setShortcutsOpen(false);
        if (mediaTarget) return setMediaTarget(null);
        if (reviseModalFor) return setReviseModalFor(null);
        if (editing) return setEditing(false);
        if (selectedIds.size > 0) return setSelectedIds(new Set());
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (paletteOpen || shortcutsOpen || editing || reviseModalFor || mediaTarget) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "j":
          e.preventDefault();
          if (view === "approve") {
            const id = adjacentId(orderedIds, activeId, 1);
            if (id) activate(id);
          }
          break;
        case "k":
          e.preventDefault();
          if (view === "approve") {
            const id = adjacentId(orderedIds, activeId, -1);
            if (id) activate(id);
          }
          break;
        case "a":
          if (activeId) approve(activeId);
          break;
        case "r":
          if (activeId) revise(activeId);
          break;
        case "e":
          startEdit();
          break;
        case "x":
          if (activeId) toggleSelect(activeId);
          break;
        case "/":
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case "1":
          setTab("outline");
          break;
        case "2":
          setTab("preview");
          break;
        case "?":
          setShortcutsOpen(true);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    paletteOpen,
    shortcutsOpen,
    editing,
    reviseModalFor,
    mediaTarget,
    orderedIds,
    activeId,
    selectedIds,
    view,
    activate,
    approve,
    revise,
    startEdit,
    toggleSelect,
  ]);

  const commands: Command[] = useMemo(
    () => [
      { id: "approve", label: "この記事を承認", hint: "A", icon: <IconCheck size={14} />, run: () => activeId && approve(activeId) },
      { id: "revise", label: "修正を依頼", hint: "R", icon: <IconWand size={14} />, run: () => activeId && revise(activeId) },
      { id: "edit", label: "本文を編集", hint: "E", icon: <IconEdit size={14} />, run: startEdit },
      { id: "v-approve", label: "承認ビューを開く", icon: <IconList size={14} />, run: () => setView("approve") },
      { id: "v-perf", label: "成績ボードを開く", icon: <IconChart size={14} />, run: () => setView("performance") },
      { id: "v-queue", label: "公開キューを開く", icon: <IconCalendar size={14} />, run: () => setView("queue") },
      { id: "kanban", label: "カンバン表示に切替", icon: <IconLayout size={14} />, run: () => { setView("approve"); setBoardMode("kanban"); } },
      { id: "listmode", label: "リスト表示に切替", icon: <IconList size={14} />, run: () => { setView("approve"); setBoardMode("list"); } },
      { id: "brand", label: "ブランド配色を切替", icon: <IconSparkles size={14} />, run: () => setBrand((b) => !b) },
      { id: "refresh", label: "データを再読み込み", icon: <IconRefresh size={14} />, run: refreshBoard },
      { id: "demo-error", label: "読み込みエラーを再現（デモ）", icon: <IconRefresh size={14} />, run: () => setLoadError(true) },
    ],
    [activeId, approve, revise, startEdit, refreshBoard]
  );

  const kanbanDrawerOpen = view === "approve" && boardMode === "kanban" && activeArticle !== null;

  const detail = (
    <DetailPanel
      article={activeArticle}
      tab={tab}
      editing={editing}
      onTabChange={setTab}
      onApprove={() => activeId && approve(activeId)}
      onRevise={() => activeId && revise(activeId)}
      onReject={() => activeId && reject(activeId)}
      onEdit={startEdit}
      onSaveEdit={saveEdit}
      onCancelEdit={() => setEditing(false)}
      onApplyRevise={applyRevise}
      onDismissRevise={dismissRevise}
      regenKeys={regenKeys}
      adoptedFixes={adoptedFixes}
      onPickEyecatch={() => activeId && setMediaTarget({ id: activeId, kind: "eyecatch" })}
      onRegenEyecatch={() => activeId && regenImage(activeId, "eyecatch")}
      onPickBodyImage={(i) => activeId && setMediaTarget({ id: activeId, kind: "body", index: i })}
      onRegenBodyImage={(i) => activeId && regenImage(activeId, "body", i)}
      onAdoptAdvice={adoptAdvice}
      onAddComment={addOutlineComment}
      onRemoveComment={removeOutlineComment}
      onSetImageInstruction={setImageInstruction}
      onClearImageInstruction={clearImageInstruction}
      onRequestOutlineRevise={requestOutlineRevise}
    />
  );

  return (
    <div className={`proto-root flex flex-col ${brand ? "proto-brand" : ""}`}>
      <TopBar
        segment={segment}
        segments={segmentDefs}
        query={query}
        awaitingCount={awaitingCount}
        publishedThisWeek={publishedThisWeek}
        onSegmentChange={setSegment}
        onQueryChange={setQuery}
        onOpenPalette={() => setPaletteOpen(true)}
        searchRef={searchRef}
        syncLabel={syncLabel}
        syncStale={syncStale}
        syncing={syncing}
        onRefresh={refreshBoard}
      />

      <div className="flex min-h-0 flex-1">
        <LeftRail view={view} awaitingCount={awaitingCount} onChange={setView} />

        <main className="min-w-0 flex-1">
          {loadError ? (
            <ErrorState onRetry={retryLoad} />
          ) : (
            <>
          {view === "approve" && boardMode === "list" && (
            <div className="flex h-full min-h-0">
              <div
                className="w-[38%] min-w-[330px] max-w-[480px] overflow-y-auto"
                style={{ borderRight: "1px solid var(--p-border)" }}
              >
                {loading ? (
                  <SkeletonBoard />
                ) : orderedIds.length === 0 ? (
                  query.trim() ? (
                    <SearchEmpty query={query.trim()} />
                  ) : segment === "awaiting" ? (
                    <ReviewDoneEmpty />
                  ) : (
                    <BoardEmpty />
                  )
                ) : (
                  <Board
                    groups={groups}
                    activeId={activeId}
                    selectedIds={selectedIds}
                    onActivate={activate}
                    onToggleSelect={toggleSelect}
                  />
                )}
              </div>
              <div className="min-w-0 flex-1" style={{ background: "var(--p-bg)" }}>
                {loading ? <SkeletonDetail /> : detail}
              </div>
            </div>
          )}

          {view === "approve" && boardMode === "kanban" && (
            <div className="relative h-full">
              <KanbanBoard articles={filtered} activeId={activeId} onActivate={activate} />
              <AnimatePresence>
                {kanbanDrawerOpen && (
                  <>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 z-20"
                      style={{ background: "rgba(4,6,9,0.5)" }}
                      onClick={() => setActiveId(null)}
                    />
                    <motion.aside
                      initial={{ x: 48, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: 48, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="absolute inset-y-0 right-0 z-30 w-[640px] max-w-[92%]"
                      style={{
                        background: "var(--p-bg)",
                        borderLeft: "1px solid var(--p-border-strong)",
                        boxShadow: "-20px 0 50px rgba(0,0,0,0.5)",
                      }}
                    >
                      {detail}
                    </motion.aside>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

          {view === "performance" && (
            <div className="h-full overflow-y-auto">
              <PerformanceBoard articles={articles} onAddIdea={addIdeaFromArticle} />
            </div>
          )}

          {view === "queue" && (
            <div className="h-full overflow-y-auto">
              <PublishQueue
                articles={articles}
                onPublishNow={publishReady}
                onSchedule={scheduleArticles}
                onUnschedule={unscheduleArticle}
                onFix={fixFromQueue}
              />
            </div>
          )}
            </>
          )}
        </main>
      </div>

      <ShortcutBar
        boardMode={boardMode}
        showBoardToggle={view === "approve"}
        brand={brand}
        onBoardModeChange={setBoardMode}
        onToggleBrand={() => setBrand((b) => !b)}
        onOpenShortcuts={() => setShortcutsOpen(true)}
      />

      <BulkBar
        count={selectedIds.size}
        onApproveAll={approveSelected}
        onClear={() => setSelectedIds(new Set())}
      />

      {paletteOpen && (
        <CommandPalette
          commands={commands}
          articles={articles}
          onClose={() => setPaletteOpen(false)}
          onJump={(id) => {
            setView("approve");
            activate(id);
          }}
        />
      )}

      {shortcutsOpen && <ShortcutOverlay onClose={() => setShortcutsOpen(false)} />}

      {reviseModalFor && (
        <ReviseRequestModal
          title={articles.find((a) => a.id === reviseModalFor)?.title ?? ""}
          onClose={() => setReviseModalFor(null)}
          onSubmit={(instruction) => requestRevise(reviseModalFor, instruction)}
        />
      )}

      {mediaTarget && (
        <MediaLibraryModal
          heading={mediaTarget.kind === "eyecatch" ? "アイキャッチを選ぶ" : `本文画像 図${(mediaTarget.index ?? 0) + 1} を差し替え`}
          onClose={() => setMediaTarget(null)}
          onSelect={(hue) => selectMedia(hue)}
        />
      )}

      <ToastStack toasts={toasts} />
    </div>
  );
}
