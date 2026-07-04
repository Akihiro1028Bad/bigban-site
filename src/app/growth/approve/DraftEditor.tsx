"use client";

/**
 * 下書きリッチエディタ本体(#77)。TipTap(ProseMirror)の DOM 結線。
 *
 * - スキーマは本文サニタイザの許可リストに合わせる(StarterKit + Link + Image + 装飾マーク)。
 * - 画像/表/SNS埋め込み/CTA/スケジュール等は PreservedBlock として**保持**(移動/削除のみ・編集しない)。
 * - 入力は sanitizeDraftHtml で正規化してから読み込み、変更ごとに onChange(getHTML) を呼ぶ。
 *   保存・サーバ側の再サニタイズは呼び出し側(ApproveClient)と #76 が担う。
 * - #UI: エディタ本文は管理画面のダーク記事タイポグラフィ `.approve-article`(approveTheme.css)を当てる。
 *   本番サイト CSS(.prose/globals.css)は /growth/approve に**意図的に読み込まれない**(隔離設計)ため、
 *   本番クラスを貼っても無スタイルになる。代わりに DetailPanel プレビュー(CommentableBody)と同じ
 *   `--p-*` トークンベースのダーク記事スタイルを共有し、編集中にその場で見出し/リード/aside 等が見える。
 *
 * 第三者ライブラリ(TipTap)への薄い結線のため、カバレッジ対象外(vitest.config.ts)。
 * 純ロジックは draftEditorContent.ts に切り出してテスト済み。
 */

import { useEffect, useRef, useState } from "react";
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
  classifyPreservedBlock,
  countDraftCharacters,
  DECORATION_OPTIONS,
  replaceImgSrcInHtml,
  sanitizeDraftHtml,
  type DecorationKey,
  type DecorationOption,
  type PreservedBlockKind,
} from "./draftEditorContent";
import {
  IconBolt,
  IconCalendar,
  IconExternalLink,
  IconFileText,
  IconImage,
  IconLayout,
  IconSparkles,
} from "./ui/icons";

interface DraftEditorProps {
  initialHtml: string;
  onChange: (html: string) => void;
  onPickImage?: (src: string) => void;
  onRegenImage?: (src: string) => void;
}

interface PreservedBlockOptions {
  onPickImage: ((src: string) => void) | null;
  onRegenImage: ((src: string) => void) | null;
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

// #P2: 保持ブロックの種別ごとのアイコン。種別判定は classifyPreservedBlock(純ロジック)に委譲。
const PRESERVED_ICON: Record<PreservedBlockKind, (p: { size?: number }) => React.ReactElement> = {
  pending: IconSparkles,
  image: IconImage,
  figure: IconImage,
  table: IconLayout,
  cta: IconBolt,
  schedule: IconCalendar,
  embed: IconExternalLink,
  unknown: IconFileText,
};

function extractFirstImgSrc(html: string): string | null {
  const match = html.match(/<img\b[^>]*\bsrc=(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? null;
}

function preservedBlockOptionsFrom(extension: ReactNodeViewProps["extension"]): PreservedBlockOptions {
  const options = extension.options as unknown as Partial<PreservedBlockOptions>;
  return {
    onPickImage: typeof options.onPickImage === "function" ? options.onPickImage : null,
    onRegenImage: typeof options.onRegenImage === "function" ? options.onRegenImage : null,
  };
}

export function replacePreservedImageSrc(editor: Editor, oldSrc: string, newUrl: string): boolean {
  let targetPos: number | null = null;
  let targetHtml = "";
  editor.state.doc.descendants((node, pos) => {
    if (targetPos !== null || node.type.name !== "preservedBlock") return false;
    const html = String((node.attrs as { html?: string }).html ?? "");
    if (extractFirstImgSrc(html) !== oldSrc) return true;
    targetPos = pos;
    targetHtml = html;
    return false;
  });
  if (targetPos === null) return false;
  return editor
    .chain()
    .focus()
    .setNodeSelection(targetPos)
    .updateAttributes("preservedBlock", { html: replaceImgSrcInHtml(targetHtml, newUrl) })
    .run();
}

function PreservedBlockView({ node, deleteNode, extension }: ReactNodeViewProps) {
  const html = String((node.attrs as { html?: string }).html ?? "");
  const contentRef = useRef<HTMLDivElement>(null);
  // #P2: 種別アイコン・ラベル・補足文をカードのヘッダに出す(判定は純ロジック)。
  const info = classifyPreservedBlock(html);
  const Icon = PRESERVED_ICON[info.kind];
  const src = extractFirstImgSrc(html);
  const { onPickImage, onRegenImage } = preservedBlockOptionsFrom(extension);
  const actionButtonClass =
    "inline-flex shrink-0 items-center gap-1 rounded border border-[var(--p-border-strong)] bg-[var(--p-bg-raised)] px-2 py-1 text-xs text-[var(--p-text-2)] hover:text-[var(--p-text)] disabled:cursor-not-allowed disabled:opacity-40";

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
      className="my-2 overflow-hidden rounded-lg border border-[var(--p-border-strong)] bg-[var(--p-bg-raised)]"
      data-preserved="true"
      data-preserved-kind={info.kind}
    >
      {/* #P2: カードのヘッダ帯。掴み所 + 種別アイコン/ラベル/補足文 + 削除。 */}
      <div className="flex items-center gap-2 border-b border-[var(--p-border)] bg-[var(--p-bg-elevated)] px-2 py-1.5">
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
          className="shrink-0 cursor-grab select-none leading-none text-[var(--p-text-3)] hover:text-[var(--p-text-2)] active:cursor-grabbing"
        >
          ⠿
        </span>
        <span aria-hidden="true" className="shrink-0 text-[var(--p-text-2)]">
          <Icon size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-[var(--p-text)]">{info.label}</span>
          <span className="ml-2 truncate text-[11px] text-[var(--p-text-3)]">{info.hint}</span>
        </div>
        {info.kind === "image" ? (
          <>
            <button
              type="button"
              aria-label="この画像を差し替え"
              disabled={!src || !onPickImage}
              onClick={() => {
                if (src) onPickImage?.(src);
              }}
              className={actionButtonClass}
            >
              <IconImage size={13} /> 差し替え
            </button>
            <button
              type="button"
              aria-label="この画像をAIで再生成"
              disabled={!src || !onRegenImage}
              onClick={() => {
                if (src) onRegenImage?.(src);
              }}
              className={actionButtonClass}
            >
              <IconSparkles size={13} /> AIで再生成
            </button>
          </>
        ) : null}
        <button
          type="button"
          aria-label={`この${info.label}ブロックを削除`}
          onClick={deleteNode}
          className="shrink-0 rounded border border-[var(--p-border-strong)] bg-[var(--p-bg-raised)] px-2 py-1 text-xs text-[var(--p-text-2)] hover:text-[var(--p-red)]"
        >
          削除
        </button>
      </div>
      {/* #181: 保持ブロックの中身(画像/表)を減光せず実色・実寸で表示する。
          画像は枠内に収め、表は横幅いっぱいにして「本物の見た目」に近づける。 */}
      <div
        ref={contentRef}
        className="min-w-0 p-2 text-[var(--p-text)] [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-md [&_table]:w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </NodeViewWrapper>
  );
}

const PreservedBlock = Node.create<PreservedBlockOptions>({
  name: "preservedBlock",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,
  addOptions() {
    return {
      onPickImage: null,
      onRegenImage: null,
    };
  },
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
  { level: 2 as const, label: "見出し2", shortcut: "⌘⌥2" },
  { level: 3 as const, label: "見出し3", shortcut: "⌘⌥3" },
  { level: 4 as const, label: "見出し4", shortcut: "⌘⌥4" },
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

// #UI: 装飾ポップオーバー内のミニプレビュー。各装飾を .approve-article の装飾スタイル
// (approveTheme.css)と視覚的に整合する「実際の見た目の縮小版」で見せる。トークン(--p-*)は
// 本文側と同じものを使い、選択の目印になるだけでなく確定後の見た目と一致させる。
function DecorationSample({ option }: { option: DecorationOption }) {
  if (option.key === "lead") {
    // 本文 .lead: font-weight 300・明るめの本文色・やや大きめ。
    return <span className="text-[13px] font-light text-[var(--p-text)]">大きめのリード文</span>;
  }
  if (option.key === "note") {
    // 本文 aside.note: raised 背景 + アクセント左罫 + NOTE ラベル。
    return (
      <span className="block rounded-md border-l-[3px] border-[var(--p-accent)] bg-[var(--p-bg-raised)] px-2 py-1 text-[11px] text-[#cdd2dc]">
        <span className="mb-0.5 block text-[8px] font-bold tracking-[0.25em] text-[var(--p-accent)]">
          NOTE
        </span>
        補足
      </span>
    );
  }
  if (option.key === "caution") {
    // 本文 aside.caution: amber 左罫 + 淡い amber 背景 + CAUTION ラベル。
    return (
      <span className="block rounded-md border-l-[3px] border-[var(--p-amber)] bg-[var(--p-amber-weak)] px-2 py-1 text-[11px] text-[#cdd2dc]">
        <span className="mb-0.5 block text-[8px] font-bold tracking-[0.25em] text-[var(--p-amber)]">
          CAUTION
        </span>
        注意
      </span>
    );
  }
  if (option.key === "highlight") {
    // 本文 aside.highlight: アクセントの淡い背景 + 左罫。
    return (
      <span className="block rounded-r-md border-l-[3px] border-[var(--p-accent)] bg-[var(--p-accent-weak)] px-2 py-1 text-[11px] text-[var(--p-text)]">
        ハイライト強調
      </span>
    );
  }
  if (option.key === "badge") {
    // 本文 .badge: bg-active のピル + text-2。
    return (
      <span className="inline-block rounded-full bg-[var(--p-bg-active)] px-2 py-px text-[10px] font-semibold tracking-wide text-[var(--p-text-2)]">
        バッジ
      </span>
    );
  }
  // mark: 本文 mark はアクセントの淡い背景ベタ(黄色ベタではない)。
  return (
    <span className="rounded-sm bg-[var(--p-accent-weak)] px-0.5 text-[13px] text-[var(--p-text)]">
      蛍光ペン
    </span>
  );
}

// #UI: 装飾ポップオーバー。素の <select> を、ミニプレビュー付きのキーボード操作可能な
// メニューに置換する。Esc で閉じ、選択で applyDecoration(ロジックは不変)を呼ぶ。
function DecorationMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleDocClick(event: MouseEvent): void {
      // NOTE: TipTap の Node import が DOM の Node を隠すため globalThis.Node を明示。
      const target = event.target as globalThis.Node | null;
      if (target && !containerRef.current?.contains(target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="装飾を付ける"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className="approve-tool inline-flex h-[30px] items-center gap-1 rounded-md border border-[var(--p-border-strong)] px-2 text-xs text-[var(--p-text-2)] hover:bg-[var(--p-bg-hover)] hover:text-[var(--p-text)]"
      >
        装飾 ▾
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="装飾を選ぶ"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
          className="absolute left-0 z-20 mt-1 w-56 rounded-md border border-[var(--p-border-strong)] bg-[var(--p-bg-elevated)] p-1 shadow-2xl"
        >
          {DECORATION_OPTIONS.map((o) => (
            <button
              key={o.key}
              type="button"
              role="menuitem"
              onClick={() => {
                applyDecoration(editor, o.key);
                setOpen(false);
              }}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-xs text-[var(--p-text-2)] hover:bg-[var(--p-bg-hover)] hover:text-[var(--p-text)]"
            >
              <span className="shrink-0">{o.label}</span>
              <span className="min-w-0 flex-1 truncate text-right">
                <DecorationSample option={o} />
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function DraftEditor({ initialHtml, onChange, onPickImage, onRegenImage }: DraftEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] } }),
      Link.configure({ openOnClick: false, autolink: false }),
      Image,
      PreservedBlock.configure({
        onPickImage: onPickImage ?? null,
        onRegenImage: onRegenImage ?? null,
      }),
      ParagraphLead,
      DecorationCallout,
      BadgeMark,
      InlineMark,
    ],
    content: sanitizeDraftHtml(initialHtml),
    editorProps: {
      attributes: {
        // #UI: 管理画面のダーク記事タイポグラフィ `.approve-article`(approveTheme.css)を当てる。
        // 本番 CSS(.prose)はこのルートに読み込まれないため、`--p-*` トークンベースの h2/リスト/
        // 装飾(.lead/aside.note 等)がその場で見える。読みやすい行長のため max-width を絞り中央寄せ、
        // キャレットはダーク背景で見えるよう本文色に合わせる。
        class:
          "approve-article mx-auto min-h-64 max-w-[42rem] px-1 py-2 caret-[var(--p-text)] focus:outline-none",
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

  // ツールバーボタンの基底(ダーク・approveTheme トークン)。
  // #P2: 狭幅の横スクロール1行(flex-nowrap)でも潰れないよう shrink-0。タッチの最低サイズは 30px 角。
  const tbBtn =
    "inline-flex h-[30px] min-w-[30px] shrink-0 items-center justify-center rounded-md border border-transparent px-2 text-xs text-[var(--p-text-2)] hover:bg-[var(--p-bg-hover)] hover:text-[var(--p-text)]";
  // #179: 現在の書式に応じてアクティブ点灯(useEditor は transaction ごとに再描画)。
  const tbOn = "border-[var(--p-accent)] bg-[var(--p-accent-weak)] text-[var(--p-accent-ink)]";
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
  const charCount = countDraftCharacters(editor.getText());
  const canUndo = editor.can().undo();
  const canRedo = editor.can().redo();

  // #UI: グループ間の細い縦罫。構造|文字|リスト|装飾|リンク を視覚的に分割する。
  // #P2: 横スクロール1行(狭幅)でも縮まないよう shrink-0。
  const divider = <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[var(--p-border)]" />;

  return (
    <div>
      {/* #P2: 狭幅(sm 未満)は横スクロールの1行チップ(flex-nowrap + overflow-x-auto)にして
          2段折返しを避ける。sm 以上は従来どおり折り返す(flex-wrap)。スクロールバーは控えめに。 */}
      <div
        role="toolbar"
        aria-label="装飾ツールバー"
        className="approve-toolbar-scroll sticky top-0 z-10 mb-2 flex flex-nowrap items-center gap-0.5 overflow-x-auto rounded-md border border-[var(--p-border)] bg-[var(--p-bg-elevated)] p-1 sm:flex-wrap sm:overflow-x-visible"
      >
        {/* 履歴 */}
        <button
          type="button"
          aria-label="元に戻す"
          title="元に戻す (⌘Z)"
          disabled={!canUndo}
          onClick={() => editor.chain().focus().undo().run()}
          className={`${tbBtn} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          ↺
        </button>
        <button
          type="button"
          aria-label="やり直し"
          title="やり直し (⌘⇧Z)"
          disabled={!canRedo}
          onClick={() => editor.chain().focus().redo().run()}
          className={`${tbBtn} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          ↻
        </button>

        {divider}

        {/* 構造(見出し) */}
        {TOOLBAR_HEADINGS.map((h) => {
          const active = editor.isActive("heading", { level: h.level });
          return (
            <button
              key={h.level}
              type="button"
              aria-label={h.label}
              aria-pressed={active}
              title={`${h.label} (${h.shortcut})`}
              onClick={() => editor.chain().focus().toggleHeading({ level: h.level }).run()}
              className={btnClass(active)}
            >
              H{h.level}
            </button>
          );
        })}

        {divider}

        {/* 文字(太字/斜体) */}
        <button type="button" aria-label="太字" aria-pressed={editor.isActive("bold")} title="太字 (⌘B)" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive("bold"), "font-bold")}>B</button>
        <button type="button" aria-label="斜体" aria-pressed={editor.isActive("italic")} title="斜体 (⌘I)" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive("italic"), "italic")}>i</button>

        {divider}

        {/* リスト + 引用 */}
        <button type="button" aria-label="箇条書き" aria-pressed={editor.isActive("bulletList")} title="箇条書き" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive("bulletList"))}>・</button>
        <button type="button" aria-label="番号付きリスト" aria-pressed={editor.isActive("orderedList")} title="番号付きリスト" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive("orderedList"))}>1.</button>
        <button type="button" aria-label="引用" aria-pressed={editor.isActive("blockquote")} title="引用" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btnClass(editor.isActive("blockquote"))}>&ldquo;</button>

        {divider}

        {/* 装飾(ポップオーバー) */}
        <DecorationMenu editor={editor} />

        {divider}

        {/* リンク(挿入/解除) */}
        <button type="button" aria-label="リンク" aria-pressed={isLink} title="リンクを挿入" onClick={addLink} className={btnClass(isLink)}>🔗</button>
        <button type="button" aria-label="リンク解除" title="リンクを解除" disabled={!isLink} onClick={() => editor.chain().focus().unsetLink().run()} className={`${tbBtn} disabled:cursor-not-allowed disabled:opacity-40`}>🔗✕</button>
      </div>
      <EditorContent editor={editor} />
      {/* フッタ: 文字数(常時)+ 保持ブロックの注記。 */}
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--p-text-3)]">
        <span>画像・表・埋め込み等は保持(移動/削除のみ)。保存時に許可外のタグは自動で除去されます。</span>
        <span className="shrink-0 tabular-nums text-[var(--p-text-2)]">{charCount.toLocaleString()} 文字</span>
      </div>
    </div>
  );
}
