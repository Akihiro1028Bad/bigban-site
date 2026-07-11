"use client";

import { ModelSettingsView } from "./ModelSettingsView";
import { PromptsView } from "./PromptsView";
import type { SettingsSection } from "./viewRouting";
import { IconBolt, IconFileText } from "./ui/icons";

interface SettingsViewProps {
  token: string;
  query: string;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
}

export function SettingsView({ token, query, section, onSectionChange }: SettingsViewProps) {
  return (
    <section aria-label="AI設定" className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 px-5 pt-5" style={{ borderBottom: "1px solid var(--p-border)" }}>
        <div className="text-[10px] font-semibold tracking-[0.18em]" style={{ color: "var(--p-accent)" }}>SYSTEM</div>
        <h1 className="mt-1 text-[20px] font-semibold">AI設定</h1>
        <p className="mt-1 text-[12px]" style={{ color: "var(--p-text-3)" }}>工程別モデルと、AIへ渡すプロンプト・前提情報を管理します。</p>
        <div role="tablist" aria-label="AI設定の種類" className="mt-4 flex gap-1">
          {(["models", "prompts"] as const).map((key) => (
            <button key={key} type="button" role="tab" aria-selected={section === key} onClick={() => onSectionChange(key)} className="flex items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-semibold" style={{ borderColor: section === key ? "var(--p-accent)" : "transparent", color: section === key ? "var(--p-text)" : "var(--p-text-3)" }}>
              {key === "models" ? <IconBolt size={14} /> : <IconFileText size={14} />}{key === "models" ? "モデル" : "プロンプト"}
            </button>
          ))}
        </div>
      </header>
      <div role="tabpanel" className="min-h-0 flex-1 overflow-auto">
        {section === "models" ? <ModelSettingsView token={token} /> : <PromptsView token={token} query={query} />}
      </div>
    </section>
  );
}
