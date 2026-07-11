/**
 * action サジェスト(#proto・画像指示再設計): 見出し/要約から推測した行為候補を chip で先出しする。
 * 白紙からの入力を不要にする(痛点2解消)。タップで即「指定」確定。
 */
"use client";

import { IconSparkles } from "./icons";

interface ActionSuggestionsProps {
  suggestions: string[];
  activeAction: string;
  onPick: (action: string) => void;
}

export function ActionSuggestions({ suggestions, activeAction, onPick }: ActionSuggestionsProps) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1 text-[10.5px] font-medium" style={{ color: "var(--p-text-3)" }}>
        <IconSparkles size={11} {...{ style: { color: "var(--p-accent)" } }} /> この見出しならこの動き?
      </div>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => {
          const active = s === activeAction;
          return (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="rounded-full px-2.5 py-[3px] text-[11.5px] font-medium transition-colors"
              style={{
                background: active ? "var(--p-purple)" : "var(--p-purple-weak)",
                color: active ? "#0a0c10" : "var(--p-purple)",
                border: "1px solid var(--p-purple)",
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}
