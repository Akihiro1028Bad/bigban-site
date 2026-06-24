"use client";

/**
 * 下書きリッチエディタ本体(#77)。TipTap(ProseMirror)の DOM 結線。
 *
 * - スキーマは本文サニタイザの許可リストに合わせる(StarterKit + Link + Image + 装飾マーク)。
 * - 画像/表/SNS埋め込み/CTA/スケジュール等は PreservedBlock として**保持**(移動/削除のみ・編集しない)。
 * - 入力は sanitizeDraftHtml で正規化してから読み込み、変更ごとに onChange(getHTML) を呼ぶ。
 *   保存・サーバ側の再サニタイズは呼び出し側(ApproveClient)と #76 が担う。
 *
 * 第三者ライブラリ(TipTap)への薄い結線のため、カバレッジ対象外(vitest.config.ts)。
 * 純ロジックは draftEditorContent.ts に切り出してテスト済み。
 */

import { useEffect, useRef } from "react";
import { Node } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import {
  EditorContent,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  useEditor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";

import { sanitizeDraftHtml } from "./draftEditorContent";

interface DraftEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
}

// 画像/表/埋め込み/CTA/スケジュール等を「保持専用」のアトミックブロックとして扱う。
// outerHTML を attrs に持ち、編集はせず移動/削除のみ可能にする(新規作成は次Epic)。
const PRESERVE_SELECTORS = [
  "figure",
  "table",
  "div.cta",
  "div.schedule",
  "a.embed",
];

function PreservedBlockView({ node, deleteNode }: ReactNodeViewProps) {
  const html = String((node.attrs as { html?: string }).html ?? "");
  const contentRef = useRef<HTMLDivElement>(null);

  // 内側の <img>/<a> はブラウザ標準のドラッグ発生源(#161)。これが ProseMirror の
  // ノードドラッグと競合し、移動時に画像が複製されていた。描画後に draggable=false を
  // 付けてネイティブドラッグを無効化し、ドラッグ経路を ProseMirror のノード移動1本に絞る。
  useEffect(() => {
    const targets = contentRef.current?.querySelectorAll("img, a");
    targets?.forEach((el) => {
      (el as HTMLElement).setAttribute("draggable", "false");
    });
  }, [html]);

  return (
    <NodeViewWrapper
      className="my-2 flex items-start gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 p-2"
      data-preserved="true"
    >
      <div
        ref={contentRef}
        className="min-w-0 flex-1 text-sm text-gray-600"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <button
        type="button"
        aria-label="このブロックを削除"
        onClick={deleteNode}
        className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-600 hover:text-red-700"
      >
        削除
      </button>
    </NodeViewWrapper>
  );
}

const PreservedBlock = Node.create({
  name: "preservedBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addAttributes() {
    return { html: { default: "" } };
  },
  parseHTML() {
    return PRESERVE_SELECTORS.map((tag) => ({
      tag,
      getAttrs: (el: HTMLElement) => ({ html: el.outerHTML }),
    }));
  },
  renderHTML({ node }) {
    const template = document.createElement("template");
    // node.attrs.html は読み込み時に sanitizeDraftHtml 済みの内容由来(許可リスト準拠)。
    template.innerHTML = String(node.attrs.html ?? "");
    const el = template.content.firstElementChild;
    return (el ? (el as unknown as DOMOutputSpec) : ["div", {}]) as DOMOutputSpec;
  },
  addNodeView() {
    return ReactNodeViewRenderer(PreservedBlockView);
  },
});

const TOOLBAR_HEADINGS = [
  { level: 2 as const, label: "見出し2" },
  { level: 3 as const, label: "見出し3" },
];

export function DraftEditor({ initialHtml, onChange }: DraftEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: false }),
      Image,
      PreservedBlock,
    ],
    content: sanitizeDraftHtml(initialHtml),
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none min-h-40 rounded-md border border-gray-300 bg-white p-3 focus:outline-none",
        "aria-label": "下書き本文エディタ",
      },
    },
    onUpdate: ({ editor: ed }) => onChange(ed.getHTML()),
  });

  // 別の下書きに切り替わったら内容を入れ替える。
  useEffect(() => {
    if (editor) editor.commands.setContent(sanitizeDraftHtml(initialHtml));
  }, [editor, initialHtml]);

  if (!editor) return null;

  const tbBtn = "rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 hover:bg-gray-50";

  function addLink(): void {
    const url = window.prompt("リンク先 URL (https://...)");
    if (!url) return;
    const trimmed = url.trim();
    // 保存時にサーバ/クライアントの両サニタイザが弾くが、エディタ内にも危険スキームを入れない。
    if (!/^(?:https:|mailto:|tel:|#)/.test(trimmed)) {
      window.alert("https:// などの安全なリンクのみ使えます。");
      return;
    }
    editor!.chain().focus().setLink({ href: trimmed }).run();
  }

  return (
    <div>
      <div role="toolbar" aria-label="装飾ツールバー" className="sticky top-0 z-10 mb-2 flex flex-wrap gap-1 bg-white">
        {TOOLBAR_HEADINGS.map((h) => (
          <button
            key={h.level}
            type="button"
            aria-label={h.label}
            onClick={() => editor.chain().focus().toggleHeading({ level: h.level }).run()}
            className={tbBtn}
          >
            H{h.level}
          </button>
        ))}
        <button type="button" aria-label="太字" onClick={() => editor.chain().focus().toggleBold().run()} className={`${tbBtn} font-bold`}>B</button>
        <button type="button" aria-label="斜体" onClick={() => editor.chain().focus().toggleItalic().run()} className={`${tbBtn} italic`}>i</button>
        <button type="button" aria-label="箇条書き" onClick={() => editor.chain().focus().toggleBulletList().run()} className={tbBtn}>・</button>
        <button type="button" aria-label="番号付きリスト" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={tbBtn}>1.</button>
        <button type="button" aria-label="引用" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={tbBtn}>&ldquo;</button>
        <button type="button" aria-label="コード" onClick={() => editor.chain().focus().toggleCode().run()} className={tbBtn}>{"</>"}</button>
        <button type="button" aria-label="水平線" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={tbBtn}>―</button>
        <button type="button" aria-label="リンク" onClick={addLink} className={tbBtn}>🔗</button>
      </div>
      <EditorContent editor={editor} />
      <p className="mt-1 text-xs text-gray-400">
        画像・表・埋め込み等は保持(移動/削除のみ)。保存時に許可外のタグは自動で除去されます。
      </p>
    </div>
  );
}
