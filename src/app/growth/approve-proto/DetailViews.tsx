/**
 * 詳細パネルのタブ別ビュー(#proto)。
 * 構成案 / プロンプト・参照 / プレビュー / 差分 / 画像 / アドバイス。
 */
"use client";

import { useState } from "react";

import { stripTags } from "./bodyBlocks";
import { DevicePreview } from "./DevicePreview";
import {
  IconArrowDown,
  IconArrowUp,
  IconChart,
  IconCheck,
  IconChevronDown,
  IconFileText,
  IconImage,
  IconSparkles,
  IconX,
} from "./icons";
import { PROMPT_GROUP_ORDER, PROTO_PROMPTS } from "./promptData";
import type { Article } from "./types";
import { EyecatchThumb, RingScore } from "./ui";

export function PromptView({ article }: { article: Article }) {
  const [open, setOpen] = useState<string | null>(PROTO_PROMPTS[0]?.filename ?? null);
  const groups = PROMPT_GROUP_ORDER.map((g) => ({
    group: g,
    prompts: PROTO_PROMPTS.filter((p) => p.group === g),
  })).filter((x) => x.prompts.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex items-start gap-2 rounded-[10px] p-3"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <IconFileText size={15} {...{ style: { color: "var(--p-text-3)", marginTop: 1 } }} />
        <span className="text-[12.5px] leading-relaxed" style={{ color: "var(--p-text-2)" }}>
          各フェーズで実際に AI へ渡す<strong style={{ color: "var(--p-text)" }}>静的プロンプトの全文</strong>（デプロイ時点の実テンプレ）。
          記事ごとの文ではなく、パイプライン全体の透明性のための一覧です。
        </span>
      </div>

      {groups.map(({ group, prompts }) => (
        <div key={group}>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            {group}
          </div>
          <div className="flex flex-col gap-1.5">
            {prompts.map((p) => {
              const isOpen = open === p.filename;
              return (
                <div
                  key={p.filename}
                  className="overflow-hidden rounded-[10px]"
                  style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
                >
                  <button
                    onClick={() => setOpen(isOpen ? null : p.filename)}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{p.label}</span>
                      <span className="mt-[2px] block truncate text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
                        {p.whenItRuns}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded-full px-2 py-[1px] text-[10.5px]"
                      style={{ background: "var(--p-bg-active)", color: "var(--p-text-3)", fontFamily: "var(--p-mono)" }}
                    >
                      {p.filename}
                    </span>
                    <span
                      className="shrink-0 transition-transform"
                      style={{ color: "var(--p-text-3)", transform: isOpen ? "rotate(180deg)" : "none" }}
                    >
                      <IconChevronDown size={16} />
                    </span>
                  </button>
                  {isOpen && (
                    <pre
                      className="max-h-[360px] overflow-auto whitespace-pre-wrap px-3.5 py-3 text-[12px] leading-relaxed"
                      style={{
                        borderTop: "1px solid var(--p-border)",
                        background: "var(--p-bg-input)",
                        color: "var(--p-text-2)",
                        fontFamily: "var(--p-mono)",
                      }}
                    >
                      {p.content}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          この記事の生成メモ
        </div>
        <div
          className="rounded-[10px] p-3 text-[12.5px] leading-relaxed"
          style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text-3)" }}
        >
          {article.prompt}
        </div>
        {article.refs.length > 0 && (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {article.refs.map((r) => (
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

export function PreviewView({ article, onSaveMeta }: { article: Article; onSaveMeta: (text: string) => void }) {
  if (article.stage === "generating") {
    const progress = article.genProgress ?? 8;
    return (
      <div className="flex flex-col gap-4">
        {article.stuck && (
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
        <div>
          <div className="mb-2 flex items-center gap-2 text-[12.5px]" style={{ color: "var(--p-purple)" }}>
            <IconSparkles size={15} className="proto-pulse" />
            {article.generatingStep ?? "生成中"}
            <span className="ml-auto tabular-nums" style={{ color: "var(--p-text-3)" }}>
              {Math.min(100, Math.round(progress))}%
            </span>
          </div>
          <div className="h-[6px] overflow-hidden rounded-full" style={{ background: "var(--p-bg-active)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, progress)}%`, background: "var(--p-purple)" }}
            />
          </div>
        </div>
        {[92, 78, 96, 64, 85, 70].map((w, i) => (
          <div key={i} className="proto-shimmer h-[13px] rounded-[5px]" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }
  if (!article.bodyHtml) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-[12px] py-16 text-center"
        style={{ border: "1px dashed var(--p-border-strong)", color: "var(--p-text-3)" }}
      >
        <IconFileText size={22} />
        <div className="text-[13px]">本文はまだ生成されていません</div>
        <div className="text-[12px]">構成案を承認すると生成が始まります</div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <MetaEditor key={article.id} article={article} onSave={onSaveMeta} />
      <DevicePreview article={article} />
    </div>
  );
}

function MetaEditor({ article, onSave }: { article: Article; onSave: (text: string) => void }) {
  const [text, setText] = useState(article.metaDescription ?? "");
  const over = text.length > 120;
  const dirty = text !== (article.metaDescription ?? "");
  return (
    <section className="rounded-[12px] p-3.5" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          メタディスクリプション（検索スニペット）
        </span>
        <span className="ml-auto text-[11px] tabular-nums" style={{ color: over ? "var(--p-red)" : "var(--p-text-3)" }}>
          {text.length}/120
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
        <button onClick={() => setText(`${stripTags(article.bodyHtml).slice(0, 116)}…`)} className="proto-btn-ghost">
          <IconSparkles size={13} /> 本文から自動生成
        </button>
        <button
          onClick={() => onSave(text)}
          disabled={!dirty}
          className="proto-btn-primary ml-auto flex items-center gap-1.5 rounded-[8px] px-3 py-[7px] text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          <IconCheck size={13} /> 保存
        </button>
      </div>
    </section>
  );
}

interface ImagesViewProps {
  article: Article;
  regenKeys: Set<string>;
  onPickEyecatch: () => void;
  onRegenEyecatch: () => void;
  onPickBodyImage: (index: number) => void;
  onRegenBodyImage: (index: number) => void;
}

function ImageFrame({
  hue,
  has,
  url,
  size,
  regenerating,
}: {
  hue: number;
  has?: boolean;
  url?: string;
  size: number;
  regenerating: boolean;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <EyecatchThumb hue={hue} has={has} url={url} size={size} />
      {regenerating && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-[8px]"
          style={{ background: "rgba(6,8,12,0.72)", color: "var(--p-purple)" }}
        >
          <IconSparkles size={18} className="proto-pulse" />
          <span className="text-[10.5px] font-medium">生成中…</span>
        </div>
      )}
    </div>
  );
}

export function ImagesView({
  article,
  regenKeys,
  onPickEyecatch,
  onRegenEyecatch,
  onPickBodyImage,
  onRegenBodyImage,
}: ImagesViewProps) {
  const bodyHues =
    article.bodyImageHues ??
    Array.from({ length: article.bodyImages }, (_, i) => (article.hue + (i + 1) * 50) % 360);
  const bodyUrls = article.bodyImageUrls ?? [];
  const ecRegen = regenKeys.has(`${article.id}:eyecatch`);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          アイキャッチ
        </div>
        <div className="flex items-center gap-3.5">
          <ImageFrame hue={article.hue} has={article.hasEyecatch} url={article.eyecatchUrl} size={120} regenerating={ecRegen} />
          <div className="flex flex-col gap-2">
            <button className="proto-btn-ghost" onClick={onPickEyecatch} disabled={ecRegen}>
              <IconImage size={13} /> メディアから選ぶ
            </button>
            <button className="proto-btn-ghost" onClick={onRegenEyecatch} disabled={ecRegen}>
              <IconSparkles size={13} /> AIで再生成
            </button>
            {!article.hasEyecatch && !ecRegen && (
              <span className="text-[11px]" style={{ color: "var(--p-amber)" }}>
                未設定 — 公開にはアイキャッチが必要です
              </span>
            )}
          </div>
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          本文画像 ({article.bodyImages})
        </div>
        {article.bodyImages === 0 ? (
          <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
            本文画像はありません。
          </div>
        ) : (
          <div className="flex flex-wrap gap-4">
            {bodyHues.map((hue, i) => {
              const regen = regenKeys.has(`${article.id}:body:${i}`);
              return (
                <div key={i} className="flex flex-col gap-1.5">
                  <ImageFrame hue={hue} has url={bodyUrls[i]} size={108} regenerating={regen} />
                  <div className="flex items-center gap-1">
                    <button
                      className="proto-tool"
                      style={{ height: 26 }}
                      onClick={() => onPickBodyImage(i)}
                      disabled={regen}
                      title="差し替え"
                    >
                      <IconImage size={13} />
                    </button>
                    <button
                      className="proto-tool"
                      style={{ height: 26 }}
                      onClick={() => onRegenBodyImage(i)}
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

interface AdviceViewProps {
  article: Article;
  adoptedFixes: Set<string>;
  onAdopt: (index: number) => void;
  onRequest: (instruction: string) => void;
  onRetry: () => void;
  onDismiss: () => void;
}

export function AdviceView(props: AdviceViewProps) {
  if (!props.article.bodyHtml) {
    return (
      <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
        下書きが生成されると、スタイリング・アドバイスを依頼できます。
      </div>
    );
  }
  return <AdviceBody {...props} />;
}

function AdviceBody({ article, adoptedFixes, onAdopt, onRequest, onRetry, onDismiss }: AdviceViewProps) {
  const [ins, setIns] = useState("");
  const status = article.adviceStatus ?? "none";

  if (status === "none") {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
          文体・構成・具体性・内部リンク導線の観点で、下書きをAIに見てもらえます。
        </div>
        <textarea
          value={ins}
          onChange={(e) => setIns(e.target.value)}
          placeholder="特に見てほしい点（任意・例：導入の説得力）"
          rows={2}
          className="w-full resize-none rounded-[9px] p-2.5 text-[13px] outline-none"
          style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
        />
        <button
          onClick={() => onRequest(ins.trim())}
          className="proto-btn-primary flex items-center justify-center gap-1.5 rounded-[10px] py-2.5 text-[13px] font-semibold"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          <IconSparkles size={15} /> アドバイスを依頼
        </button>
      </div>
    );
  }

  if (status === "requested") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--p-purple)" }}>
          <IconSparkles size={15} className="proto-pulse" /> AIが分析中です。少しお待ちください…
        </div>
        {[88, 70, 92, 64].map((w, i) => (
          <div key={i} className="proto-shimmer h-[13px] rounded-[5px]" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div
        className="flex flex-col items-start gap-3 rounded-[12px] p-4"
        style={{ background: "var(--p-red-weak)", border: "1px solid rgba(248,113,113,0.25)" }}
      >
        <div className="flex items-center gap-2 text-[13px] font-medium" style={{ color: "var(--p-red)" }}>
          <IconX size={15} /> アドバイス生成に失敗しました
        </div>
        <div className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
          外部処理が応答しませんでした。時間をおいて再依頼してください。
        </div>
        <button
          onClick={onRetry}
          className="proto-btn-primary flex items-center gap-1.5 rounded-[9px] px-3 py-2 text-[12.5px] font-semibold"
          style={{ background: "var(--p-accent)", color: "#0a0c10" }}
        >
          <IconSparkles size={14} /> 再依頼する
        </button>
      </div>
    );
  }

  const a = article.advice;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          スタイリング・アドバイス
        </span>
        <button onClick={onDismiss} className="proto-btn-ghost ml-auto" style={{ padding: "4px 9px" }}>
          <IconX size={13} /> 閉じる
        </button>
      </div>
      <div
        className="flex items-center gap-4 rounded-[12px] p-4"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <RingScore value={a.overall} size={64} />
        <div className="flex-1">
          <div className="text-[11px] uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            総評
          </div>
          <div className="mt-1 text-[13px]" style={{ color: "var(--p-text-2)" }}>
            公開可能な水準。内部リンク導線をひと押しすると、さらに良くなります。
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {a.scores.map((s) => (
          <div
            key={s.label}
            className="rounded-[10px] p-3"
            style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px]" style={{ color: "var(--p-text-2)" }}>{s.label}</span>
              <span className="text-[12px] font-semibold tabular-nums">{s.score}</span>
            </div>
            <div className="mt-2 h-[5px] overflow-hidden rounded-full" style={{ background: "var(--p-bg-active)" }}>
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(0, s.score)}%`,
                  background: s.score >= 80 ? "var(--p-green)" : s.score >= 65 ? "var(--p-accent)" : "var(--p-amber)",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--p-green)" }}>
          <IconArrowUp size={14} /> 強み
        </div>
        <ul className="flex flex-col gap-1.5">
          {a.strengths.map((s, i) => (
            <li key={i} className="text-[12.5px]" style={{ color: "var(--p-text-2)" }}>
              ・{s}
            </li>
          ))}
        </ul>
      </div>

      {a.fixes.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--p-amber)" }}>
            <IconArrowDown size={14} /> 直すべき点
          </div>
          <div className="flex flex-col gap-2.5">
            {a.fixes.map((f, i) => {
              const adopted = adoptedFixes.has(`${article.id}:${i}`);
              return (
                <div
                  key={i}
                  className="rounded-[10px] p-3"
                  style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
                >
                  <div
                    className="border-l-2 pl-2.5 text-[12.5px] italic"
                    style={{ borderColor: "var(--p-amber)", color: "var(--p-text-2)" }}
                  >
                    「{f.quote}」
                  </div>
                  <div className="mt-2 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
                    {f.reason}
                  </div>
                  <div className="mt-1.5 flex items-start gap-1.5 text-[12.5px]" style={{ color: "var(--p-accent-ink)" }}>
                    <IconChart size={13} {...{ style: { marginTop: 2, color: "var(--p-accent)" } }} />
                    {f.suggestion}
                  </div>
                  <div className="mt-2.5 flex justify-end">
                    {adopted ? (
                      <span
                        className="flex items-center gap-1.5 rounded-[8px] px-2.5 py-[5px] text-[11.5px] font-medium"
                        style={{ background: "var(--p-green-weak)", color: "var(--p-green)" }}
                      >
                        <IconCheck size={13} /> 反映済み
                      </span>
                    ) : (
                      <button onClick={() => onAdopt(i)} className="proto-btn-ghost">
                        <IconCheck size={13} /> 本文に反映
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
