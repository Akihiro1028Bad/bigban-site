/**
 * 詳細パネルのタブ別ビュー(#proto)。
 * 構成案 / プロンプト・参照 / プレビュー / 差分 / 画像 / アドバイス。
 */
"use client";

import { DevicePreview } from "./DevicePreview";
import {
  IconArrowDown,
  IconArrowUp,
  IconChart,
  IconCheck,
  IconFileText,
  IconImage,
  IconSparkles,
} from "./icons";
import type { Article } from "./types";
import { EyecatchThumb, RingScore } from "./ui";

export function PromptView({ article }: { article: Article }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          生成プロンプト
        </div>
        <pre
          className="whitespace-pre-wrap rounded-[10px] p-3.5 text-[12.5px] leading-relaxed"
          style={{
            background: "var(--p-bg-input)",
            border: "1px solid var(--p-border)",
            color: "var(--p-text-2)",
            fontFamily: "var(--p-mono)",
          }}
        >
          {article.prompt}
        </pre>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          参照資料 {article.refs.length > 0 && `(${article.refs.length})`}
        </div>
        {article.refs.length === 0 ? (
          <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
            参照資料はありません。
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {article.refs.map((r) => (
              <div
                key={r.source}
                className="flex items-center gap-2.5 rounded-[8px] px-3 py-2"
                style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
              >
                <IconFileText size={15} {...{ style: { color: "var(--p-text-3)" } }} />
                <span className="text-[13px]">{r.title}</span>
                <span
                  className="ml-auto text-[11px]"
                  style={{ color: "var(--p-text-3)", fontFamily: "var(--p-mono)" }}
                >
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

export function PreviewView({ article }: { article: Article }) {
  if (article.stage === "generating") {
    const progress = article.genProgress ?? 8;
    return (
      <div className="flex flex-col gap-4">
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
  return <DevicePreview article={article} />;
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
  size,
  regenerating,
}: {
  hue: number;
  has?: boolean;
  size: number;
  regenerating: boolean;
}) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <EyecatchThumb hue={hue} has={has} size={size} />
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
  const ecRegen = regenKeys.has(`${article.id}:eyecatch`);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          アイキャッチ
        </div>
        <div className="flex items-center gap-3.5">
          <ImageFrame hue={article.hue} has={article.hasEyecatch} size={120} regenerating={ecRegen} />
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
                  <ImageFrame hue={hue} size={108} regenerating={regen} />
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
}

export function AdviceView({ article, adoptedFixes, onAdopt }: AdviceViewProps) {
  const a = article.advice;
  if (a.overall === 0) {
    return (
      <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
        下書きが生成されると、スタイリング・アドバイスを依頼できます。
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-5">
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
