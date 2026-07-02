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
import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import type { DOMOutputSpec } from "@tiptap/pm/model";
import {
  EditorContent,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  useEditor,
  type Editor,
  type ReactNodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";

import {
  DECORATION_OPTIONS,
  sanitizeDraftHtml,
  type DecorationKey,
} from "./draftEditorContent";

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
      className="my-2 flex items-start gap-2 rounded-md border border-dashed border-gray-300 bg-white p-2"
      data-preserved="true"
    >
      {/* #180: ドラッグの掴み所。TipTap は draggable:true に加え data-drag-handle が必須
          (これが無いと #161 で内側 img の draggable=false にした結果、移動手段が消えていた)。
          ドラッグ経路をこのハンドル経由の ProseMirror ノード移動の1本に絞る。
          #F5: マウス専用機能でキーボード代替が無いため role="button"/aria-label は付けず
          aria-hidden の装飾ハンドルにする(支援技術に「操作可能なボタン」と嘘をつかない)。 */}
      <span
        data-drag-handle
        contentEditable={false}
        aria-hidden="true"
        title="ドラッグして移動"
        className="mt-0.5 shrink-0 cursor-grab select-none px-1 leading-none text-gray-400 hover:text-gray-600 active:cursor-grabbing"
      >
        ⠿
      </span>
      {/* #181: 保持ブロックの中身(画像/表)を減光せず実色・実寸で表示する。
          画像は枠内に収め、表は横幅いっぱいにして「本物の見た目」に近づける。 */}
      <div
        ref={contentRef}
        className="min-w-0 flex-1 text-gray-800 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_table]:w-full"
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

// #179: 装飾の TipTap 拡張。出力 HTML は本文サニタイザ(STRICT)の許可リスト内に収め、
// note/caution/highlight は装飾アシスタント #147 の applyDecoration と同じ <aside class="..."> にする。

// リード文: 現在の段落に class="lead" を付ける(段落へのグローバル属性)。
const ParagraphLead = Extension.create({
  name: "paragraphLead",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          lead: {
            default: false,
            parseHTML: (el: HTMLElement) => el.classList.contains("lead"),
            renderHTML: (attrs: { lead?: boolean }) => (attrs.lead ? { class: "lead" } : {}),
          },
        },
      },
    ];
  },
});

const CALLOUT_VARIANTS = ["note", "caution", "highlight"] as const;
type CalloutVariant = (typeof CALLOUT_VARIANTS)[number];

// note/caution/highlight: 段落を <aside class="variant"> で包むブロック・コールアウト。
const DecorationCallout = Node.create({
  name: "decorationCallout",
  group: "block",
  content: "block+",
  defining: true,
  addAttributes() {
    return {
      variant: {
        default: "note" as CalloutVariant,
        parseHTML: (el: HTMLElement) =>
          CALLOUT_VARIANTS.find((v) => el.classList.contains(v)) ?? "note",
        renderHTML: (attrs: { variant?: CalloutVariant }) => ({ class: attrs.variant ?? "note" }),
      },
    };
  },
  parseHTML() {
    return CALLOUT_VARIANTS.map((v) => ({ tag: `aside.${v}` }));
  },
  renderHTML({ HTMLAttributes }) {
    return ["aside", mergeAttributes(HTMLAttributes), 0];
  },
});

// バッジ: 選択範囲に <span class="badge"> を付けるインラインマーク。
const BadgeMark = Mark.create({
  name: "badgeMark",
  parseHTML() {
    return [{ tag: "span.badge" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ class: "badge" }, HTMLAttributes), 0];
  },
});

// インライン強調: 選択範囲に <mark> を付けるインラインマーク。
const InlineMark = Mark.create({
  name: "inlineMark",
  parseHTML() {
    return [{ tag: "mark" }];
  },
  renderHTML() {
    return ["mark", 0];
  },
});

const TOOLBAR_HEADINGS = [
  { level: 2 as const, label: "見出し2" },
  { level: 3 as const, label: "見出し3" },
  { level: 4 as const, label: "見出し4" },
];

// #179: 装飾キーごとの付け方。block=aside で包む / paragraph=lead クラス / inline=マーク。
function applyDecoration(editor: Editor, key: DecorationKey): void {
  const chain = editor.chain().focus();
  if (key === "lead") {
    chain.updateAttributes("paragraph", { lead: !editor.getAttributes("paragraph").lead }).run();
    return;
  }
  if (key === "badge") {
    chain.toggleMark("badgeMark").run();
    return;
  }
  if (key === "mark") {
    chain.toggleMark("inlineMark").run();
    return;
  }
  // note / caution / highlight: 同じ variant なら解除、別 variant なら切替、無ければ包む。
  if (editor.isActive("decorationCallout", { variant: key })) {
    chain.lift("decorationCallout").run();
  } else if (editor.isActive("decorationCallout")) {
    chain.updateAttributes("decorationCallout", { variant: key }).run();
  } else {
    chain.wrapIn("decorationCallout", { variant: key }).run();
  }
}

export function DraftEditor({ initialHtml, onChange }: DraftEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: false }),
      Image,
      PreservedBlock,
      ParagraphLead,
      DecorationCallout,
      BadgeMark,
      InlineMark,
    ],
    content: sanitizeDraftHtml(initialHtml),
    editorProps: {
      attributes: {
        class:
          "prose max-w-none min-h-64 rounded-md border border-gray-300 bg-white p-4 focus:outline-none",
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
  const tbOn = "border-gray-800 bg-gray-800 text-white hover:bg-gray-800";
  // #179: 現在の書式に応じてボタンをアクティブ表示する(useEditor は transaction ごとに再描画)。
  function btnClass(active: boolean, extra = ""): string {
    return `${tbBtn} ${extra} ${active ? tbOn : ""}`.trim();
  }

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

  const isLink = editor.isActive("link");

  return (
    <div>
      <div role="toolbar" aria-label="装飾ツールバー" className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-1 bg-white">
        {TOOLBAR_HEADINGS.map((h) => {
          const active = editor.isActive("heading", { level: h.level });
          return (
            <button
              key={h.level}
              type="button"
              aria-label={h.label}
              aria-pressed={active}
              onClick={() => editor.chain().focus().toggleHeading({ level: h.level }).run()}
              className={btnClass(active)}
            >
              H{h.level}
            </button>
          );
        })}
        <button type="button" aria-label="太字" aria-pressed={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive("bold"), "font-bold")}>B</button>
        <button type="button" aria-label="斜体" aria-pressed={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive("italic"), "italic")}>i</button>
        <button type="button" aria-label="箇条書き" aria-pressed={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive("bulletList"))}>・</button>
        <button type="button" aria-label="番号付きリスト" aria-pressed={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive("orderedList"))}>1.</button>
        <button type="button" aria-label="引用" aria-pressed={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive("blockquote"))}>&ldquo;</button>
        <button type="button" aria-label="コード" aria-pressed={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()} className={btnClass(editor.isActive("code"))}>{"</>"}</button>
        <button type="button" aria-label="コードブロック" aria-pressed={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={btnClass(editor.isActive("codeBlock"))}>{"{ }"}</button>
        <button type="button" aria-label="水平線" onClick={() => editor.chain().focus().setHorizontalRule().run()} className={tbBtn}>―</button>
        <button type="button" aria-label="リンク" aria-pressed={isLink} onClick={addLink} className={btnClass(isLink)}>🔗</button>
        <button type="button" aria-label="リンク解除" disabled={!isLink} onClick={() => editor.chain().focus().unsetLink().run()} className={`${tbBtn} disabled:cursor-not-allowed disabled:opacity-40`}>🔗✕</button>
        {/* #179: 装飾。選んだ装飾を現在の選択/段落へ付ける。出力 HTML は #147 と同じ許可リスト内。 */}
        <select
          aria-label="装飾を付ける"
          value=""
          onChange={(e) => {
            const k = e.target.value as DecorationKey | "";
            if (k) applyDecoration(editor, k);
            e.currentTarget.value = "";
          }}
          className={`${tbBtn} cursor-pointer`}
        >
          <option value="">装飾…</option>
          {DECORATION_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <EditorContent editor={editor} />
      <p className="mt-1 text-xs text-gray-400">
        画像・表・埋め込み等は保持(移動/削除のみ)。保存時に許可外のタグは自動で除去されます。
      </p>
    </div>
  );
}
