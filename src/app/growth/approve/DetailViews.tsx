/**
 * 詳細パネルのタブ別ビュー(#proto 移植・本番データ化)。
 * プロンプト・参照 / プレビュー / 画像。巨大 Article は使わず各 View に必要フィールドだけ渡す(AD2)。
 */
"use client";

import { useState } from "react";

import { EXCERPT_MAX, autoExcerpt, isExcerptTooLong } from "@/lib/growth/excerptDraft";

import { DevicePreview } from "./DevicePreview";
import { buildPreviewHtml } from "./previewHtml";
import { renderPromptMarkdown } from "./promptMarkdown";
import type { DraftState } from "./draftTypes";
import type { BoardStage } from "./ui/boardStage";
import { EyecatchThumb } from "./ui/eyecatchThumb";
import { IconCheck, IconFileText, IconImage, IconSparkles } from "./ui/icons";

/** HTML からプレーンテキストを取り出す(本 file ローカルの小ユーティリティ)。 */
function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

interface PromptRef {
  title: string;
  source: string;
}

interface PromptViewProps {
  prompt: string;
  refs?: PromptRef[];
}

export function PromptView({ prompt, refs }: PromptViewProps) {
  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-start gap-2 rounded-[10px] p-3"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <IconFileText size={15} {...{ style: { color: "var(--p-text-3)", marginTop: 1 } }} />
        <span className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
          各フェーズで AI へ渡す<strong style={{ color: "var(--p-text)" }}>静的プロンプトの全文</strong>は、左の「プロンプト」面でまとめて確認できます。
          ここはこの記事に固有の生成メモと参照だけを表示します。
        </span>
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          この記事の生成メモ
        </div>
        <div
          className="rounded-[10px] p-3"
          style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
        >
          {/* #212: 生成メモも左ペインと同じ Markdown 整形で表示する(プレーンは段落として描画)。 */}
          <div
            className="prose prose-invert prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderPromptMarkdown(prompt) }}
          />
        </div>
        {refs && refs.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {refs.map((r) => (
              <div
                key={r.source}
                className="flex items-center gap-2.5 rounded-[8px] px-3 py-2"
                style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
              >
                <IconFileText size={15} {...{ style: { color: "var(--p-text-3)" } }} />
                <span className="text-[13px]">{r.title}</span>
                <span className="ml-auto text-[11px]" style={{ color: "var(--p-text-3)", fontFamily: "var(--p-mono)" }}>
                  {r.source}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface PreviewViewProps {
  stage: BoardStage;
  generatingStep?: string;
  stuck?: boolean;
  /** 下書き取得状態(#75)。ローディング/取得失敗/未作成/見つからない/実プレビューを出し分ける。 */
  draftState: DraftState;
  metaDescription?: string;
  slug: string;
  onSaveMeta: (text: string) => void;
  /** 取得失敗からの再読み込み(#75)。 */
  onReloadDraft: () => void;
}

export function PreviewView({
  stage,
  generatingStep,
  stuck,
  draftState,
  metaDescription,
  slug,
  onSaveMeta,
  onReloadDraft,
}: PreviewViewProps) {
  // #75: bodyHtml が空でも body にフォールバックしてプレビューへ渡す(#100)。
  const bodyHtml =
    draftState.status === "ready"
      ? draftState.draft.bodyHtml || draftState.draft.body
      : "";
  if (stage === "generating") {
    // 本番 stage=generating に進捗% は無いため、進捗バーは不定 shimmer ＋ 段階ラベルへ縮約(AD5-4)。
    return (
      <div className="flex flex-col gap-4">
        {stuck && (
          <div
            className="flex items-start gap-2 rounded-[10px] p-3"
            style={{ background: "var(--p-amber-weak)", border: "1px solid rgba(249,185,78,0.3)" }}
          >
            <IconSparkles size={15} {...{ style: { color: "var(--p-amber)", marginTop: 1 } }} />
            <span className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-amber)" }}>
              <strong>生成が滞留しています</strong>（15分以上進んでいません）。自宅PCの巡回（生成ループ）が止まっていないか確認してください。
            </span>
          </div>
        )}
        <div className="mb-2 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--p-purple)" }}>
          <IconSparkles size={15} className="approve-pulse" />
          {generatingStep ?? "生成中"}
        </div>
        <div className="approve-shimmer h-[6px] rounded-full" />
        {[92, 78, 96, 64, 85, 70].map((w, i) => (
          <div key={i} className="approve-shimmer h-[13px] rounded-[5px]" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  // #75: 下書き取得状態の出し分け(ローディング/取得失敗/見つからない/未作成)。
  if (draftState.status === "loading") {
    return (
      <div className="py-16 text-center text-[13px]" style={{ color: "var(--p-text-3)" }}>
        読み込み中…
      </div>
    );
  }
  if (draftState.status === "error") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 rounded-[12px] py-16 text-center"
        style={{ border: "1px dashed var(--p-border-strong)", color: "var(--p-text-3)" }}
      >
        <IconFileText size={22} />
        <div className="text-[13px]" style={{ color: "var(--p-red)" }}>{draftState.error}</div>
        <button onClick={onReloadDraft} className="approve-btn-ghost">
          再読み込み
        </button>
      </div>
    );
  }
  if (draftState.status === "empty") {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-[12px] py-16 text-center"
        style={{ border: "1px dashed var(--p-border-strong)", color: "var(--p-text-3)" }}
      >
        <IconFileText size={22} />
        <div className="text-[13px]">下書きが見つかりませんでした</div>
      </div>
    );
  }
  if (draftState.status === "idle" || !bodyHtml) {
    // #75: contentId が無い記事(idle)は未作成扱い。ready だが本文空(通常は起きない)も同文言で受ける。
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-[12px] py-16 text-center"
        style={{ border: "1px dashed var(--p-border-strong)", color: "var(--p-text-3)" }}
      >
        <IconFileText size={22} />
        <div className="text-[13px]">まだ下書きは生成されていません</div>
        <div className="text-[12px]">構成案を承認すると生成が始まります</div>
      </div>
    );
  }
  const draft = draftState.status === "ready" ? draftState.draft : null;
  const eyecatch = draft?.eyecatch;
  // #166: AI再生成(アイキャッチ/本文画像)が依頼中/処理中の間、プレビュー上部に状態を出す。
  const regenBusy = (s?: string): boolean => s === "依頼中" || s === "処理中";
  const regenStatus = regenBusy(draft?.eyecatchRegen?.status)
    ? draft?.eyecatchRegen?.status
    : regenBusy(draft?.bodyRegen?.status)
      ? draft?.bodyRegen?.status
      : undefined;
  return (
    <div className="flex flex-col gap-4">
      {regenStatus ? (
        <div
          className="flex items-center gap-2 rounded-[10px] px-3 py-2 text-[12px] font-medium"
          style={{ background: "var(--p-purple-weak, rgba(155,135,245,0.12))", color: "var(--p-purple)" }}
        >
          <IconSparkles size={14} className="approve-pulse" />
          AI再生成 {regenStatus}…（PCが処理し、完了したら自動で反映されます）
        </div>
      ) : null}
      <MetaEditor bodyHtml={bodyHtml} metaDescription={metaDescription} onSave={onSaveMeta} />
      {/* #210: 端末プレビューは body のみ描画するため、公開ページ同様アイキャッチをヒーローとして先頭に合成する。 */}
      <DevicePreview html={buildPreviewHtml(bodyHtml, eyecatch)} slug={slug} />
    </div>
  );
}

interface MetaEditorProps {
  bodyHtml: string;
  metaDescription?: string;
  onSave: (text: string) => void;
}

// #UI(P1⑤): 本文編集モーダル(DraftEditWorkspace)でも同じ検索スニペット編集 UI を使えるよう
// export する。プレビュータブ(PreviewView 内)と同一コンポーネント・同一保存経路を共有し、重複実装しない。
export function MetaEditor({ bodyHtml, metaDescription, onSave }: MetaEditorProps) {
  const [text, setText] = useState(metaDescription ?? "");
  const over = isExcerptTooLong(text);
  const dirty = text !== (metaDescription ?? "");
  return (
    <section className="rounded-[12px] p-3.5" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          メタディスクリプション（検索スニペット）
        </span>
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: over ? "var(--p-red)" : "var(--p-text-3)" }}>
          {text.length}/{EXCERPT_MAX}
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="検索結果に出る説明文（120字目安）"
        className="w-full resize-none rounded-[8px] p-2.5 text-[12.5px] outline-none"
        style={{
          background: "var(--p-bg-input)",
          border: `1px solid ${over ? "var(--p-red)" : "var(--p-border)"}`,
          color: "var(--p-text)",
        }}
      />
      {over && (
        <div className="mt-1 text-[11px]" style={{ color: "var(--p-red)" }}>
          120字を超えると検索結果で末尾が省略されます。
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button onClick={() => setText(autoExcerpt(stripTags(bodyHtml)))} className="approve-btn-ghost">
          <IconSparkles size={13} /> 本文から自動生成
        </button>
        <button
          onClick={() => onSave(text)}
          disabled={!dirty}
          // #P1⑤: 編集モーダルではフッタの本文「保存」ボタンと同居するため、
          // メタ保存であることを明示する(支援技術・テストの取り違え防止)。
          aria-label="メタディスクリプションを保存"
          className="approve-btn-primary ml-auto flex items-center gap-1.5 rounded-[8px] px-3 py-[7px] text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          <IconCheck size={13} /> 保存
        </button>
      </div>
    </section>
  );
}

interface ImageFrameProps {
  hue: number;
  has?: boolean;
  url?: string;
  alt?: string;
  size: number;
  regenerating: boolean;
}

function ImageFrame({ hue, has, url, alt, size, regenerating }: ImageFrameProps) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <EyecatchThumb hue={hue} has={has} url={url} size={size} alt={alt} />
      {regenerating && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-[8px]"
          style={{ background: "rgba(6,8,12,0.72)", color: "var(--p-purple)" }}
        >
          <IconSparkles size={18} className="approve-pulse" />
          <span className="text-[10.5px] font-medium">生成中…</span>
        </div>
      )}
    </div>
  );
}

interface ImagesViewProps {
  hue: number;
  hasEyecatch: boolean;
  eyecatchUrl?: string;
  bodyImages: number;
  bodyImageHues?: number[];
  bodyImageUrls?: (string | undefined)[];
  regenKeys: Set<string>;
  itemId: string;
  onPickEyecatch: () => void;
  onRegenEyecatch: () => void;
  onAddBodyImage: () => void;
  onPickBodyImage?: (index: number) => void;
  onRegenBodyImage?: (index: number) => void;
}

export function ImagesView({
  hue,
  hasEyecatch,
  eyecatchUrl,
  bodyImages,
  bodyImageHues,
  bodyImageUrls,
  regenKeys,
  itemId,
  onPickEyecatch,
  onRegenEyecatch,
  onAddBodyImage,
  onPickBodyImage,
  onRegenBodyImage,
}: ImagesViewProps) {
  const bodyHues =
    bodyImageHues ?? Array.from({ length: bodyImages }, (_, i) => (hue + (i + 1) * 50) % 360);
  const bodyUrls = bodyImageUrls ?? [];
  const ecRegen = regenKeys.has(`${itemId}:eyecatch`);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          アイキャッチ
        </div>
        <div className="flex items-center gap-3.5">
          <ImageFrame hue={hue} has={hasEyecatch} url={eyecatchUrl} size={120} regenerating={ecRegen} />
          <div className="flex flex-col gap-2">
            <button className="approve-btn-ghost" onClick={onPickEyecatch} disabled={ecRegen}>
              <IconImage size={13} /> メディアから選ぶ
            </button>
            <button className="approve-btn-ghost" onClick={onRegenEyecatch} disabled={ecRegen}>
              <IconSparkles size={13} /> AIで再生成
            </button>
            {!hasEyecatch && !ecRegen && (
              <span className="text-[11px]" style={{ color: "var(--p-amber)" }}>
                未設定 — 公開にはアイキャッチが必要です
              </span>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center gap-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            本文画像 ({bodyImages})
          </div>
          <button type="button" onClick={onAddBodyImage} className="approve-btn-ghost ml-auto text-[12px]">
            ＋ 画像を追加
          </button>
        </div>
        {bodyImages === 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
              本文画像はありません。
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {bodyHues.map((h, i) => {
              const regen = regenKeys.has(`${itemId}:body:${i}`);
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  <ImageFrame hue={h} has url={bodyUrls[i]} size={108} regenerating={regen} />
                  <div className="flex items-center gap-1">
                    <button
                      className="approve-tool"
                      style={{ height: 26 }}
                      onClick={() => onPickBodyImage?.(i)}
                      disabled={regen}
                      title="差し替え"
                    >
                      <IconImage size={13} />
                    </button>
                    <button
                      className="approve-tool"
                      style={{ height: 26 }}
                      onClick={() => onRegenBodyImage?.(i)}
                      disabled={regen}
                      title="AIで再生成"
                    >
                      <IconSparkles size={13} />
                    </button>
                    <span className="ml-1 text-[11px]" style={{ color: "var(--p-text-3)" }}>
                      図{i + 1}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
