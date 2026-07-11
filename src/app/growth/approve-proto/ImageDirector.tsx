/**
 * 画像ディレクター(#proto・画像指示再設計): mode==="custom"(指定)のときに行内展開する編集面。
 * 「宇宙人は何をしている?」の一言＋見出し由来サジェスト＋house styleライブプレビューを束ねる。
 * 先頭セクションのみ「アイキャッチに使う」、こだわる人向けに「高度な指定(自由記述)」を退避先として持つ。
 */
"use client";

import { useEffect, useState } from "react";

import { ActionInput } from "./ActionInput";
import { ActionSuggestions } from "./ActionSuggestions";
import { HouseStylePreview } from "./HouseStylePreview";
import { IconSparkles } from "./icons";
import { resolveAction, suggestActions } from "./imageIntent";
import type { ImageInstruction, OutlineSection } from "./types";

interface ImageDirectorProps {
  section: OutlineSection;
  hue: number;
  isFirst: boolean;
  instruction: ImageInstruction | undefined;
  onSetAction: (action: string) => void;
  onToggleEyecatch: () => void;
  onSetAdvancedNote: (note: string) => void;
  onCancel: () => void;
}

export function ImageDirector({
  section,
  hue,
  isFirst,
  instruction,
  onSetAction,
  onToggleEyecatch,
  onSetAdvancedNote,
  onCancel,
}: ImageDirectorProps) {
  const [draft, setDraft] = useState(instruction?.action ?? "");
  const [debounced, setDebounced] = useState(draft);
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(instruction?.advancedNote));

  // プレビュー字幕のチラつきを抑えるため、入力は少し遅らせて反映する。
  useEffect(() => {
    const t = setTimeout(() => setDebounced(draft), 180);
    return () => clearTimeout(t);
  }, [draft]);

  const suggestions = suggestActions(section);
  const previewAction = debounced.trim() || resolveAction(section, { mode: "auto" });

  const pick = (action: string) => {
    setDraft(action);
    onSetAction(action);
  };

  return (
    <div
      className="mt-2.5 rounded-[10px] p-3"
      style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-purple)" }}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--p-purple)" }}>
            宇宙人は何をしている?
          </div>
          <ActionInput
            value={draft}
            onChange={setDraft}
            onCommit={() => onSetAction(draft)}
            onCancel={onCancel}
          />
          <ActionSuggestions suggestions={suggestions} activeAction={draft.trim()} onPick={pick} />
        </div>

        <div className="w-full shrink-0 sm:w-[168px]">
          <HouseStylePreview hue={hue} action={previewAction} isEyecatch={isFirst && instruction?.isEyecatch} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2" style={{ borderTop: "1px solid var(--p-border)", paddingTop: 10 }}>
        {isFirst && (
          <label className="flex cursor-pointer items-center gap-1.5 text-[11.5px]" style={{ color: "var(--p-text-2)" }}>
            <input
              type="checkbox"
              checked={Boolean(instruction?.isEyecatch)}
              onChange={onToggleEyecatch}
              className="accent-[var(--p-accent)]"
            />
            このセクションをアイキャッチに使う
          </label>
        )}
        <button
          onClick={() => setAdvancedOpen((v) => !v)}
          className="flex items-center gap-1 text-[11.5px]"
          style={{ color: "var(--p-text-3)" }}
          aria-expanded={advancedOpen}
        >
          <IconSparkles size={11} /> 高度な指定（自由に書く）
        </button>
        <button onClick={onCancel} className="ml-auto text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
          おまかせに戻す
        </button>
      </div>

      {advancedOpen && (
        <textarea
          value={instruction?.advancedNote ?? ""}
          onChange={(e) => onSetAdvancedNote(e.target.value)}
          placeholder="画風は固定です。特別な構図・図解だけ自由に記述（例: コート全体の俯瞰図）"
          rows={2}
          className="mt-2 w-full resize-none rounded-[8px] p-2 text-[12px] outline-none"
          style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
        />
      )}
    </div>
  );
}
