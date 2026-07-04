/**
 * 承認画面の状態画面(#H7 分解 / #proto P2 再スキン)。
 * 読み込みスケルトン(SkeletonBoard)/ 空状態(EmptyState 派生)/ エラー(ErrorState)。
 * happy path 以外の"間"を作り production 級の堅牢さを見せる(proto StateScreens 移植)。
 *
 * いずれも状態は親が持ち、ここは表示のみ。後方互換のため
 * LoadingGate / LoadErrorGate / EmptyGate は新部品を包む薄いラッパーとして温存する。
 */

"use client";

import type { ReactNode } from "react";

import { AddProposalForm } from "./AddProposalForm";
import { IconCheckCircle, IconRefresh, IconSearch } from "./ui/icons";

function Bar({ w, h = 13 }: { w: string; h?: number }) {
  return <div className="approve-shimmer rounded-[5px]" style={{ width: w, height: h }} />;
}

/** 盤(左カラム)のスケルトン。読み込み中を aria-busy で明示する。 */
export function SkeletonBoard() {
  return (
    <div className="flex flex-col gap-4 px-4 py-4" aria-busy="true" aria-label="読み込み中">
      {[0, 1].map((g) => (
        <div key={g} className="flex flex-col gap-3">
          <Bar w="92px" h={11} />
          {[0, 1, 2].map((r) => (
            <div key={r} className="flex items-start gap-3">
              <div className="approve-shimmer h-[38px] w-[38px] shrink-0 rounded-[8px]" />
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

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  sub?: string;
  tone?: "success" | "neutral";
}

/** 空状態の共通レイアウト(アイコン + タイトル + 補足)。 */
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
        {sub && (
          <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
            {sub}
          </div>
        )}
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

/** 検索絞り込みで一致0件のときの空状態。query を反映する。 */
export function SearchEmpty({ query }: { query: string }) {
  return (
    <EmptyState
      icon={<IconSearch size={24} />}
      title="一致する記事がありません"
      sub={`「${query}」に一致する記事は見つかりませんでした。`}
    />
  );
}

/**
 * 読み込みエラー + 再試行。message を渡すと具体的なエラー内容を alert で明示する
 * (沈黙させない・#H)。message 未指定時は汎用文言のみ。
 */
export function ErrorState({ onRetry, message }: { onRetry: () => void; message?: string }) {
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
        {message ? (
          <div role="alert" className="mt-1.5 text-[12.5px]" style={{ color: "var(--p-red)" }}>
            {message}
          </div>
        ) : null}
        <div className="mt-1.5 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
          ネットワークを確認して、もう一度お試しください。
        </div>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-[9px] px-4 py-2 text-[13px] font-semibold"
        style={{ background: "var(--p-accent)", color: "#0a0c10" }}
      >
        <IconRefresh size={14} /> 再読み込み
      </button>
    </div>
  );
}

/** 後方互換: 自動取得の読み込み中ゲート。中身は SkeletonBoard。
 * 外側 approve-shell(theme が fixed inset-0 を注入)＋内側センタリングで画面中央に置く
 * (inset-0 と max-w の競合で左上に張り付くのを構造で回避)。 */
export function LoadingGate() {
  return (
    <main className="approve-shell flex items-center justify-center">
      <div className="mx-auto w-full max-w-md">
        <SkeletonBoard />
      </div>
    </main>
  );
}

/** 後方互換: 自動取得の失敗ゲート。実エラー(message)を明示し再試行できる。 */
export function LoadErrorGate({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="approve-shell flex items-center justify-center">
      <div className="mx-auto w-full max-w-md">
        <ErrorState onRetry={onRetry} message={message} />
      </div>
    </main>
  );
}

/**
 * 承認待ちゼロの空状態の中身(達成感ある ReviewDoneEmpty ＋ 施策追加フォーム)。
 * シェル(ヘッダー＋左ナビ)の内側に埋め込めるよう、`<main className="approve-shell">`
 * ラッパーを持たない純粋なコンテンツにする(#Task2)。EmptyGate はこれを全画面で包む。
 */
export function EmptyGateContent({
  token,
  onAdded,
}: {
  token: string;
  onAdded: Parameters<typeof AddProposalForm>[0]["onAdded"];
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-6">
      <ReviewDoneEmpty />
      <div className="mx-auto mt-2 max-w-md text-left">
        <AddProposalForm token={token} onAdded={onAdded} />
      </div>
    </div>
  );
}

/**
 * 後方互換: 承認待ちゼロのゲート。達成感ある空状態(ReviewDoneEmpty)へ寄せつつ
 * 施策追加フォーム(AddProposalForm・#255)は必ず維持する。
 * 中身は EmptyGateContent を全画面(approve-shell)で包むだけ。
 */
export function EmptyGate({
  token,
  onAdded,
}: {
  token: string;
  onAdded: Parameters<typeof AddProposalForm>[0]["onAdded"];
}) {
  return (
    <main className="approve-shell flex items-center justify-center overflow-y-auto">
      <EmptyGateContent token={token} onAdded={onAdded} />
    </main>
  );
}
