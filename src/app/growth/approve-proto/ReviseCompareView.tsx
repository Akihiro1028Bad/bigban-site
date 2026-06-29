/**
 * 修正案の見比べ(#proto・修正ループ): 元 vs 新 を並べ、対象ごとに反映/却下する。
 * 「提示があった対象だけ」適用できる(#40 の方針)。
 */
"use client";

import { IconCheck, IconWand, IconX } from "./icons";
import { segDiff } from "./reviseMock";
import type { Article, OutlineSection, ReviseTarget } from "./types";

interface ReviseCompareViewProps {
  article: Article;
  onApply: (target: ReviseTarget) => void;
  onDismiss: (target: ReviseTarget) => void;
}

function InstructionRecap({ article }: { article: Article }) {
  const ins = article.reviseInstruction;
  if (!ins) return null;
  const rows: { label: string; text: string }[] = [];
  if (ins.outline) rows.push({ label: "構成案", text: ins.outline });
  if (ins.title) rows.push({ label: "タイトル", text: ins.title });
  if (ins.body) rows.push({ label: "本文", text: ins.body });
  return (
    <div
      className="rounded-[10px] p-3"
      style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
    >
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
        <IconWand size={13} /> あなたの修正指示
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-2 text-[12.5px]">
            <span className="shrink-0 rounded-full px-2 py-[1px] text-[11px]" style={{ background: "var(--p-bg-active)", color: "var(--p-text-2)" }}>
              {r.label}
            </span>
            <span className="whitespace-pre-line" style={{ color: "var(--p-text-2)" }}>{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApplyRow({
  onApply,
  onDismiss,
}: {
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <button onClick={onDismiss} className="proto-btn-ghost" style={{ color: "var(--p-text-3)" }}>
        <IconX size={13} /> 却下
      </button>
      <button
        onClick={onApply}
        className="flex items-center gap-1.5 rounded-[8px] px-3 py-[7px] text-[12.5px] font-semibold"
        style={{ background: "var(--p-green)", color: "#06140d" }}
      >
        <IconCheck size={14} /> この案を反映
      </button>
    </div>
  );
}

export function ReviseCompareView({ article, onApply, onDismiss }: ReviseCompareViewProps) {
  const status = article.reviseStatus ?? "none";

  if (status === "requested") {
    return (
      <div className="flex flex-col gap-4">
        <InstructionRecap article={article} />
        <div className="flex items-center gap-2 text-[12.5px]" style={{ color: "var(--p-purple)" }}>
          <IconWand size={15} /> AIが修正案を作成中です…
        </div>
        {[88, 72, 94, 60].map((w, i) => (
          <div key={i} className="proto-shimmer h-[13px] rounded-[5px]" style={{ width: `${w}%` }} />
        ))}
      </div>
    );
  }

  const proposal = article.reviseProposal;
  if (status !== "presenting" || !proposal) {
    return (
      <div className="text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
        現在、提示中の修正案はありません。フッターの「修正を依頼」から指示できます。
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <InstructionRecap article={article} />

      {proposal.outline && (
        <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            構成案の修正案
          </div>
          <OutlineDiff from={proposal.outline.from} to={proposal.outline.to} />
          <ApplyRow onApply={() => onApply("outline")} onDismiss={() => onDismiss("outline")} />
        </section>
      )}

      {proposal.title && (
        <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            タイトルの修正案
          </div>
          <TitleDiff from={proposal.title.from} to={proposal.title.to} />
          <ApplyRow onApply={() => onApply("title")} onDismiss={() => onDismiss("title")} />
        </section>
      )}

      {proposal.body && (
        <section className="rounded-[12px] p-4" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              本文の修正案
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: "var(--p-text-3)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: "var(--p-green-weak)", boxShadow: "inset 2px 0 0 var(--p-green)" }} />
              追加・変更箇所
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <BodyColumn label="元" html={proposal.body.from} muted />
            <BodyColumn label="新（提案）" html={proposal.body.to} />
          </div>
          <ApplyRow onApply={() => onApply("body")} onDismiss={() => onDismiss("body")} />
        </section>
      )}
    </div>
  );
}

function TitleDiff({ from, to }: { from: string; to: string }) {
  const d = segDiff(from, to);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-[11px]" style={{ color: "var(--p-text-3)" }}>元</span>
        <span className="text-[14px]" style={{ color: "var(--p-text-3)" }}>
          {d.prefix}
          {d.removed && (
            <span style={{ background: "var(--p-red-weak)", color: "var(--p-red)", borderRadius: 4, padding: "0 3px", textDecoration: "line-through" }}>
              {d.removed}
            </span>
          )}
          {d.suffix}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-[11px]" style={{ color: "var(--p-accent)" }}>新</span>
        <span className="text-[15px] font-medium">
          {d.prefix}
          {d.added && (
            <span style={{ background: "var(--p-green-weak)", color: "var(--p-green)", borderRadius: 4, padding: "0 3px" }}>
              {d.added}
            </span>
          )}
          {d.suffix}
        </span>
      </div>
    </div>
  );
}

function OutlineDiff({ from, to }: { from: OutlineSection[]; to: OutlineSection[] }) {
  const fromKeys = new Set(from.map((s) => `${s.heading}|${s.summary}`));
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="min-w-0">
        <div className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-text-3)" }}>元</div>
        <ol className="flex flex-col gap-1.5">
          {from.map((s, i) => (
            <li key={i} className="rounded-[8px] px-2.5 py-1.5 text-[12px]" style={{ background: "var(--p-bg-input)", color: "var(--p-text-3)" }}>
              <div className="font-medium" style={{ color: "var(--p-text-2)" }}>{s.heading}</div>
              {s.summary && <div className="text-[11.5px]">{s.summary}</div>}
            </li>
          ))}
        </ol>
      </div>
      <div className="min-w-0">
        <div className="mb-1.5 text-[11px] font-medium" style={{ color: "var(--p-green)" }}>新（提案）</div>
        <ol className="flex flex-col gap-1.5">
          {to.map((s, i) => {
            const changed = !fromKeys.has(`${s.heading}|${s.summary}`);
            return (
              <li
                key={i}
                className="rounded-[8px] px-2.5 py-1.5 text-[12px]"
                style={{
                  background: changed ? "var(--p-green-weak)" : "var(--p-bg-input)",
                  boxShadow: changed ? "inset 2px 0 0 var(--p-green)" : "none",
                }}
              >
                <div className="font-medium" style={{ color: changed ? "var(--p-green)" : "var(--p-text-2)" }}>{s.heading}</div>
                {s.summary && <div className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>{s.summary}</div>}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

function BodyColumn({ label, html, muted }: { label: string; html: string; muted?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 text-[11px] font-medium" style={{ color: muted ? "var(--p-text-3)" : "var(--p-green)" }}>
        {label}
      </div>
      <div
        className="max-h-[320px] overflow-y-auto rounded-[10px] p-3"
        style={{
          background: "var(--p-bg-input)",
          border: "1px solid var(--p-border)",
          opacity: muted ? 0.75 : 1,
        }}
      >
        {/* mockData/reviseMock 由来の静的HTMLのみ。本番は microCMS をサニタイズして渡す。 */}
        <div className="proto-article" style={{ fontSize: 12.5 }} dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}
