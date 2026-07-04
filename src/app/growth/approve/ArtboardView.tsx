"use client";

import { useState } from "react";
import Image from "next/image";

import { BODY_IMAGE_MAX } from "@/lib/growth/bodyImage";
import { suggestImageIdea } from "@/lib/growth/suggestImageIdea";
import type { RequestedBodyImageStyle } from "@/lib/growth/bodyImage";

import { slotStateOf } from "./artboardState";
import { BODY_IMAGE_STYLE_CHIPS } from "./bodyRegenRequest";
import type { OutlineImage, OutlineSection } from "./outline";

const TEXT_SPEC_STYLES = new Set<RequestedBodyImageStyle>(["court", "flow", "infographic"]);
const MAX_TEXT_SPEC = 1000;

const STYLE_BADGE: Record<RequestedBodyImageStyle, { color: string; bg: string; icon: string }> = {
  auto: { color: "var(--p-text)", bg: "var(--p-bg-raised)", icon: "AUTO" },
  mascot: { color: "var(--p-purple)", bg: "var(--p-purple-weak)", icon: "UFO" },
  illust: { color: "var(--p-teal)", bg: "rgba(45, 212, 191, 0.12)", icon: "ILL" },
  court: { color: "var(--p-green)", bg: "rgba(34, 197, 94, 0.12)", icon: "CRT" },
  flow: { color: "var(--p-amber)", bg: "rgba(245, 158, 11, 0.14)", icon: "FLOW" },
  infographic: { color: "var(--p-red)", bg: "rgba(248, 113, 113, 0.12)", icon: "INFO" },
};

interface ArtboardViewProps {
  sections: OutlineSection[];
  eyecatchUrl?: string;
  onSave: (sections: OutlineSection[]) => Promise<boolean>;
  onOpenEyecatch: () => void;
  isSaving: boolean;
  saveError?: string;
}

interface EditorState {
  sectionIndex: number;
  style: RequestedBodyImageStyle;
  description: string;
  textSpec: string;
  shouldSuppressImage: boolean;
}

function firstImageOf(section: OutlineSection): OutlineImage | undefined {
  return section.images[0];
}

function specifiedCountOf(sections: readonly OutlineSection[]): number {
  return sections.reduce((sum, section) => sum + section.images.length, 0);
}

function skeletonCountOf(description: string): number {
  const length = description.trim().length;
  if (length > 70) return 4;
  if (length > 32) return 3;
  return 2;
}

function styleChipLabel(style: RequestedBodyImageStyle): string {
  return BODY_IMAGE_STYLE_CHIPS.find((chip) => chip.key === style)?.label ?? "おまかせ";
}

function editorStateFor(section: OutlineSection, sectionIndex: number): EditorState {
  const image = firstImageOf(section);
  const style = image?.style ?? "auto";
  return {
    sectionIndex,
    style,
    description: image?.description ?? suggestImageIdea(section.heading, style),
    textSpec: image?.textSpec ?? "",
    shouldSuppressImage: section.suppressImage === true,
  };
}

function replaceSection(sections: readonly OutlineSection[], index: number, section: OutlineSection): OutlineSection[] {
  return sections.map((current, currentIndex) => (currentIndex === index ? section : current));
}

export function ArtboardView({
  sections,
  eyecatchUrl,
  onSave,
  onOpenEyecatch,
  isSaving,
  saveError,
}: ArtboardViewProps) {
  const [editor, setEditor] = useState<EditorState | null>(null);
  const specifiedCount = specifiedCountOf(sections);

  function handleOpenEditor(sectionIndex: number): void {
    setEditor(editorStateFor(sections[sectionIndex], sectionIndex));
  }

  function handleStyleChange(style: RequestedBodyImageStyle): void {
    setEditor((current) => {
      if (!current) return current;
      const section = sections[current.sectionIndex];
      const previousImage = firstImageOf(section);
      const shouldReplaceDescription =
        current.description.trim() === "" ||
        current.description === suggestImageIdea(section.heading, current.style) ||
        current.description === previousImage?.description;
      return {
        ...current,
        style,
        description: shouldReplaceDescription ? suggestImageIdea(section.heading, style) : current.description,
        textSpec: TEXT_SPEC_STYLES.has(style) ? current.textSpec : "",
      };
    });
  }

  async function handleSave(): Promise<void> {
    if (!editor) return;
    const section = sections[editor.sectionIndex];
    const nextSection: OutlineSection = editor.shouldSuppressImage
      ? { ...section, images: [], suppressImage: true }
      : {
          ...section,
          images: [
            {
              style: editor.style,
              description: editor.description.trim() || suggestImageIdea(section.heading, editor.style),
              ...(TEXT_SPEC_STYLES.has(editor.style) && editor.textSpec.trim()
                ? { textSpec: editor.textSpec.trim() }
                : {}),
            },
          ],
          suppressImage: undefined,
        };
    const ok = await onSave(replaceSection(sections, editor.sectionIndex, nextSection));
    if (ok) setEditor(null);
  }

  function renderEditor(state: EditorState) {
    const section = sections[state.sectionIndex];
    return (
      <section
        role="region"
        aria-label={`画像スロット編集: ${section.heading}`}
        className="rounded-[10px] p-4"
        style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border-strong)" }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold" style={{ color: "var(--p-text-3)" }}>
              画像スロット
            </p>
            <h3 className="mt-1 text-[15px] font-semibold leading-snug">{section.heading}</h3>
          </div>
          <button
            type="button"
            onClick={() => setEditor(null)}
            className="approve-btn-ghost rounded-[8px] px-2.5 py-1.5 text-[12px]"
          >
            閉じる
          </button>
        </div>

        {saveError ? (
          <p className="mt-3 rounded-[8px] px-3 py-2 text-[12.5px]" style={{ background: "rgba(248,113,113,0.12)", color: "var(--p-red)" }}>
            {saveError}
          </p>
        ) : null}

        <fieldset className="mt-4">
          <legend className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            スタイル
          </legend>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="本文画像スタイル">
            {BODY_IMAGE_STYLE_CHIPS.map((chip) => {
              const selected = chip.key === state.style;
              return (
                <button
                  key={chip.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => handleStyleChange(chip.key)}
                  disabled={state.shouldSuppressImage || isSaving}
                  className="rounded-full px-3 py-[6px] text-[12.5px] disabled:opacity-45"
                  style={{
                    background: selected ? "var(--p-accent)" : "var(--p-bg-raised)",
                    color: selected ? "#0a0c10" : "var(--p-text-2)",
                    border: "1px solid var(--p-border)",
                  }}
                >
                  {chip.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="mt-4">
          <label htmlFor="artboard-description" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
            画像の説明
          </label>
          <textarea
            id="artboard-description"
            aria-label="画像の説明"
            value={state.description}
            onChange={(event) => setEditor({ ...state, description: event.target.value })}
            disabled={state.shouldSuppressImage || isSaving}
            rows={4}
            className="w-full resize-none rounded-[8px] p-2.5 text-[12.5px] outline-none disabled:opacity-50"
            style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
          />
        </div>

        {TEXT_SPEC_STYLES.has(state.style) && !state.shouldSuppressImage ? (
          <div className="mt-3">
            <label htmlFor="artboard-text-spec" className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
              図に入れる文字・数値
              <span className="ml-auto text-[11px] tabular-nums" style={{ color: "var(--p-text-3)" }}>
                {state.textSpec.length}/{MAX_TEXT_SPEC}
              </span>
            </label>
            <textarea
              id="artboard-text-spec"
              aria-label="図に入れる文字・数値"
              value={state.textSpec}
              maxLength={MAX_TEXT_SPEC}
              onChange={(event) => setEditor({ ...state, textSpec: event.target.value })}
              rows={3}
              className="w-full resize-none rounded-[8px] p-2.5 text-[12.5px] outline-none"
              style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)", color: "var(--p-text)" }}
            />
          </div>
        ) : null}

        <label className="mt-3 flex items-center gap-2 rounded-[8px] px-3 py-2 text-[12.5px]" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
          <input
            type="checkbox"
            checked={state.shouldSuppressImage}
            disabled={isSaving}
            onChange={(event) => setEditor({ ...state, shouldSuppressImage: event.target.checked })}
          />
          画像なし
        </label>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="approve-btn-primary rounded-[8px] px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50"
            style={{ background: "var(--p-accent)", color: "#0a0c10" }}
          >
            画像指示を保存
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)]">
      <div className="rounded-[14px] p-3" style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}>
        <button
          type="button"
          aria-label="アイキャッチを開く"
          onClick={onOpenEyecatch}
          className="group block aspect-video w-full overflow-hidden rounded-[10px] text-left"
          style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border-strong)" }}
        >
          {eyecatchUrl ? (
            <Image src={eyecatchUrl} alt="アイキャッチ" width={560} height={315} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center px-4 text-center text-[12.5px]" style={{ color: "var(--p-text-3)" }}>
              下書き生成時に自動生成されます
            </span>
          )}
        </button>

        <div className="mt-3 space-y-3">
          {sections.map((section, sectionIndex) => {
            const image = firstImageOf(section);
            const state = slotStateOf(image, undefined, false);
            const isBlocked = state === "empty" && specifiedCount >= BODY_IMAGE_MAX && editor?.sectionIndex !== sectionIndex;
            const badge = image ? STYLE_BADGE[image.style] : null;
            return (
              <section key={`${section.heading}-${sectionIndex}`} className="rounded-[10px] p-3" style={{ background: "var(--p-bg-elevated)", border: "1px solid var(--p-border)" }}>
                <h2 className="text-[13px] font-semibold leading-snug">{section.heading}</h2>
                <div className="mt-2 space-y-1.5" aria-hidden="true">
                  {Array.from({ length: skeletonCountOf(section.description) }, (_, index) => (
                    <div
                      key={index}
                      className="h-1.5 rounded-full"
                      style={{
                        width: `${index === 0 ? 92 : index === 1 ? 76 : index === 2 ? 84 : 56}%`,
                        background: "var(--p-border)",
                      }}
                    />
                  ))}
                </div>

                {section.suppressImage ? (
                  <button
                    type="button"
                    onClick={() => handleOpenEditor(sectionIndex)}
                    className="mt-3 w-full rounded-[9px] px-3 py-3 text-left text-[12.5px]"
                    style={{ background: "var(--p-bg-input)", border: "1px dashed var(--p-border-strong)", color: "var(--p-text-3)" }}
                  >
                    画像なし
                  </button>
                ) : state === "specified" && image && badge ? (
                  <button
                    type="button"
                    onClick={() => handleOpenEditor(sectionIndex)}
                    className="mt-3 w-full overflow-hidden rounded-[9px] text-left"
                    style={{ background: badge.bg, border: "1px solid var(--p-border)" }}
                  >
                    <span className="flex items-center gap-2 px-3 py-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] text-[10px] font-bold" style={{ background: "var(--p-bg-elevated)", color: badge.color }}>
                        {badge.icon}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-semibold" style={{ color: badge.color }}>
                          {styleChipLabel(image.style)}
                        </span>
                        <span className="block truncate text-[12px]" style={{ color: "var(--p-text-2)" }}>
                          {image.description}
                        </span>
                      </span>
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={isBlocked ? `画像上限のため追加できません: ${section.heading}` : `画像を置く: ${section.heading}`}
                    onClick={() => handleOpenEditor(sectionIndex)}
                    disabled={isBlocked}
                    className="mt-3 min-h-[58px] w-full rounded-[9px] px-3 py-3 text-center text-[12.5px] font-semibold disabled:cursor-not-allowed"
                    style={{ background: "transparent", border: "1px dashed var(--p-border-strong)", color: isBlocked ? "var(--p-text-3)" : "var(--p-purple)" }}
                  >
                    {isBlocked ? `上限 ${BODY_IMAGE_MAX} 枚(他のセクションの画像を減らすと追加できます)` : "＋画像を置く"}
                  </button>
                )}

                {editor?.sectionIndex === sectionIndex ? <div className="mt-3 lg:hidden">{renderEditor(editor)}</div> : null}
              </section>
            );
          })}
        </div>
      </div>

      <div className="hidden lg:block">
        {editor ? (
          renderEditor(editor)
        ) : (
          <div className="rounded-[10px] p-5 text-[13px]" style={{ background: "var(--p-bg-elevated)", border: "1px dashed var(--p-border)", color: "var(--p-text-3)" }}>
            左の画像スロットを選ぶと編集できます。
          </div>
        )}
      </div>
    </div>
  );
}
