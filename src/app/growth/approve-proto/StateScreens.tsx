/**
 * 状態系の画面(#proto): 読み込みスケルトン / 空状態 / エラー。
 * happy path 以外の“間”を作り、production 級の堅牢さを見せる。
 */
"use client";

import type { ReactNode } from "react";

import { IconCheckCircle, IconInbox, IconRefresh, IconSearch } from "./icons";

function Bar({ w, h = 13 }: { w: string; h?: number }) {
  return <div className="proto-shimmer rounded-[5px]" style={{ width: w, height: h }} />;
}

/** 盤(左カラム)のスケルトン。 */
export function SkeletonBoard() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4" aria-busy="true" aria-label="読み込み中">
      {[0, 1].map((g) => (
        <div key={g} className="flex flex-col gap-3">
          <Bar w="92px" h={11} />
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-start gap-3">
              <div className="proto-shimmer h-[38px] w-[38px] shrink-0 rounded-[8px]" />
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <Bar w="86%" />
                <Bar w="60%" h={11} />
                <Bar w="40%" h={10} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** 詳細パネルのスケルトン。 */
export function SkeletonDetail() {
  return (
    <div className="flex h-full flex-col px-6 py-5" aria-busy="true" aria-label="読み込み中">
      <div className="flex flex-col gap-3">
        <Bar w="120px" h={20} />
        <Bar w="70%" h={22} />
        <div className="flex gap-3">
          <Bar w="64px" h={12} />
          <Bar w="64px" h={12} />
          <Bar w="120px" h={12} />
        </div>
      </div>
      <div className="mt-7 flex flex-col gap-3.5">
        {["96%", "88%", "92%", "70%", "84%", "60%"].map((w, i) => (
          <Bar key={i} w={w} />
        ))}
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  sub?: string;
  tone?: "success" | "neutral";
}

export function EmptyState({ icon, title, sub, tone = "neutral" }: EmptyStateProps) {
  const color = tone === "success" ? "var(--p-green)" : "var(--p-text-3)";
  const bg = tone === "success" ? "var(--p-green-weak)" : "var(--p-bg-raised)";
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-[14px]"
        style={{ background: bg, border: "1px solid var(--p-border)", color }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[14px] font-medium">{title}</div>
        {sub && <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>{sub}</div>}
      </div>
    </div>
  );
}

/** あなた待ち0件の達成感ある空状態。 */
export function ReviewDoneEmpty() {
  return (
    <EmptyState
      tone="success"
      icon={<IconCheckCircle size={26} />}
      title="本日のレビュー完了！"
      sub="あなたのアクション待ちはありません。お疲れさまでした。"
    />
  );
}

export function SearchEmpty({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<IconSearch size={24} />}
      title="一致する記事がありません"
      sub={`「${query}」に一致する記事は見つかりませんでした。`}
    />
  );
}

export function BoardEmpty() {
  return (
    <EmptyState icon={<IconInbox size={24} />} title="記事がありません" sub="この条件に該当する記事はありません。" />
  );
}

/** ポーリング連続失敗のバナー(fail-stale・time-stale とは別)。 */
export function PollFailBanner({ lastLabel, onRetry }: { lastLabel: string; onRetry: () => void }) {
  return (
    <div
      className="flex items-center gap-2.5 px-4 py-2.5"
      style={{ background: "var(--p-amber-weak)", borderBottom: "1px solid rgba(249,185,78,0.3)", color: "var(--p-amber)" }}
      role="status"
    >
      <IconRefresh size={15} />
      <span className="text-[12.5px]">
        最新情報を取得できていません（最終更新 {lastLabel}）。回線や自宅PCの状態を確認してください。
      </span>
      <button
        onClick={onRetry}
        className="proto-btn-ghost ml-auto"
        style={{ borderColor: "var(--p-amber)", color: "var(--p-amber)" }}
      >
        再試行
      </button>
    </div>
  );
}

/** 読み込みエラー＋再試行。 */
export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 py-16 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-[14px]"
        style={{ background: "var(--p-red-weak)", border: "1px solid rgba(248,113,113,0.25)", color: "var(--p-red)" }}
      >
        <IconRefresh size={24} />
      </div>
      <div>
        <div className="text-[14px] font-medium">データを読み込めませんでした</div>
        <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
          ネットワークを確認して、もう一度お試しください。
        </div>
      </div>
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold"
        style={{ background: "var(--p-accent)", color: "#0a0c10" }}
      >
        <IconRefresh size={14} /> 再試行
      </button>
    </div>
  );
}
