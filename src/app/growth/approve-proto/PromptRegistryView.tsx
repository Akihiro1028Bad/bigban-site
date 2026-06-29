/**
 * プロンプト面(#proto・#204): フェーズ別プロンプト全文の閲覧専用 master-detail。
 * 記事に依存しない運用監査ビュー。記事詳細側はその段階で効くプロンプトに絞って表示する。
 */
"use client";

import { useState } from "react";

import { IconArrowLeft, IconFileText } from "./icons";
import { FACILITY_CONTEXT, PROMPT_GROUP_ORDER, PROMPT_REFERENCES, PROTO_PROMPTS } from "./promptData";

const ALL_PROMPTS = [...PROTO_PROMPTS, ...PROMPT_REFERENCES];
const FACILITY_FILE = "__facility-context";

export function PromptRegistryView() {
  const [activeFile, setActiveFile] = useState(FACILITY_FILE);
  // 狭幅(lg未満)の1ペイン制御: 一覧で項目を選ぶと詳細へ、戻るで一覧へ。lg以上は常に両ペイン。
  const [showDetailMobile, setShowDetailMobile] = useState(false);
  const select = (file: string) => {
    setActiveFile(file);
    setShowDetailMobile(true);
  };
  const groups = PROMPT_GROUP_ORDER.map((g) => ({ group: g, prompts: ALL_PROMPTS.filter((p) => p.group === g) })).filter(
    (x) => x.prompts.length > 0
  );
  const active = ALL_PROMPTS.find((p) => p.filename === activeFile) ?? null;

  return (
    <div className="flex h-full min-h-0">
      <div
        className={`${showDetailMobile ? "hidden lg:block" : "block"} w-full overflow-y-auto lg:w-[34%] lg:min-w-[280px] lg:max-w-[420px]`}
        style={{ borderRight: "1px solid var(--p-border)" }}
      >
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--p-border)" }}>
          <IconFileText size={16} {...{ style: { color: "var(--p-accent)" } }} />
          <span className="text-[14px] font-semibold">プロンプト</span>
          <span className="ml-auto text-[11.5px]" style={{ color: "var(--p-text-3)" }}>実テンプレ全文</span>
        </div>
        <section className="py-1">
          <div className="px-4 py-[7px] text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-2)" }}>
            前提情報（ピン留め）
          </div>
          <button
            onClick={() => select(FACILITY_FILE)}
            className="relative flex w-full flex-col gap-[2px] px-4 py-2.5 text-left transition-colors"
            style={{ background: activeFile === FACILITY_FILE ? "var(--p-bg-raised)" : "transparent" }}
          >
            {activeFile === FACILITY_FILE && <span className="absolute inset-y-1 left-0 w-[3px] rounded-full" style={{ background: "var(--p-accent)" }} />}
            <span className="text-[13px] font-medium">施設コンテキスト</span>
            <span className="truncate text-[11.5px]" style={{ color: "var(--p-text-3)" }}>全フェーズ冒頭に正典として注入</span>
          </button>
        </section>
        {groups.map((g) => (
          <section key={g.group} className="py-1">
            <div className="px-4 py-[7px] text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-2)" }}>
              {g.group}
            </div>
            {g.prompts.map((p) => {
              const isActive = p.filename === activeFile;
              return (
                <button
                  key={p.filename}
                  onClick={() => select(p.filename)}
                  className="relative flex w-full flex-col gap-[2px] px-4 py-2.5 text-left transition-colors"
                  style={{ background: isActive ? "var(--p-bg-raised)" : "transparent" }}
                >
                  {isActive && <span className="absolute inset-y-1 left-0 w-[3px] rounded-full" style={{ background: "var(--p-accent)" }} />}
                  <span className="text-[13px] font-medium">{p.label}</span>
                  <span className="truncate text-[11.5px]" style={{ color: "var(--p-text-3)" }}>{p.whenItRuns}</span>
                </button>
              );
            })}
          </section>
        ))}
      </div>

      <div
        className={`${showDetailMobile ? "block" : "hidden lg:block"} min-w-0 flex-1 overflow-y-auto`}
        style={{ background: "var(--p-bg)" }}
      >
        <div className="px-6 pt-4 lg:hidden">
          <button onClick={() => setShowDetailMobile(false)} className="proto-btn-ghost" aria-label="プロンプト一覧へ戻る">
            <IconArrowLeft size={14} /> 一覧
          </button>
        </div>
        {activeFile === FACILITY_FILE ? (
          <div className="px-6 py-5">
            <h1 className="mb-3 text-[16px] font-semibold">施設コンテキスト（前提情報）</h1>
            <pre
              className="whitespace-pre-wrap rounded-[12px] p-4 text-[12.5px] leading-relaxed"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text-2)", fontFamily: "var(--p-mono)" }}
            >
              {FACILITY_CONTEXT}
            </pre>
          </div>
        ) : active ? (
          <div className="px-6 py-5">
            <div className="mb-3 flex items-baseline gap-2">
              <h1 className="text-[16px] font-semibold">{active.label}</h1>
              <span className="text-[11.5px]" style={{ color: "var(--p-text-3)", fontFamily: "var(--p-mono)" }}>{active.filename}</span>
            </div>
            <div className="mb-3 text-[12.5px]" style={{ color: "var(--p-text-3)" }}>{active.whenItRuns}</div>
            <pre
              className="whitespace-pre-wrap rounded-[12px] p-4 text-[12.5px] leading-relaxed"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text-2)", fontFamily: "var(--p-mono)" }}
            >
              {active.content}
            </pre>
          </div>
        ) : null}
      </div>
    </div>
  );
}
