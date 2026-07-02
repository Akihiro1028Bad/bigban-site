/**
 * プロンプト閲覧用の Markdown → HTML 整形(#212)。
 *
 * フェーズプロンプト(scripts/growth/prompts/*.md)は Markdown なので、見出し・箇条書き・
 * 強調・コード・リンクを整形して読みやすく表示する。ただし本文に含まれる `<role>` `<workflow>`
 * `<p>` `<img>` などの疎な XML風タグは「指示テキスト」であって HTML ではないため、
 * リテラルの文字列として見えるようにエスケープする(HTML 化も除去もしない)。
 *
 * marked の既定 `html` レンダラは生 HTML を素通しするので、専用インスタンスで override して
 * エスケープに差し替える。最後に DOMPurify でサニタイズして安全な HTML だけを返す。
 *
 * さらに block レベルの html トークナイザを無効化する(`tokenizer.html` が undefined を返す)。
 * 実プロンプトは `<role>` `<non_negotiables>` `<source_of_truth>` などの XML風構造タグを
 * 単独行で使うが、marked は既定でこれらを「HTML ブロック」と見なし、中身の Markdown
 * (強調・箇条書き)を整形せず生のまま出す。block html を無効化すると、これらのタグは
 * 段落テキストとして流れ込み、周囲・内部の Markdown が整形されるようになる。タグ自体は
 * inline html トークンとして拾われ、上記 `renderer.html` の escape でリテラル表示のまま残る。
 *
 * 補足: 句読点に直接隣接する強調(例 `**…）**`)は CommonMark の emphasis-flanking
 * 規則によりリテラルのまま残ることがある。これは仕様由来で許容する。
 */

import { Marked } from "marked";
import DOMPurify from "isomorphic-dompurify";

import type { Tokens } from "marked";

/** 生 HTML トークンを表示用テキストへエスケープする(タグをリテラル文字として見せる)。 */
function escapeHtml(source: string): string {
  return source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// グローバル状態を汚さない専用インスタンス。html を override して生タグをエスケープ表示にする。
const md = new Marked({
  gfm: true,
  breaks: false,
  tokenizer: {
    // block レベルの html 検出を無効化する。構造タグ(<role> 等)を HTML ブロック扱いに
    // させず、中身/周囲の Markdown を整形させるため。inline html は引き続き拾われ escape される。
    html(): undefined {
      return undefined;
    },
  },
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(text);
    },
  },
});

/** Markdown ソースを整形済みかつサニタイズ済みの HTML 文字列に変換する。 */
export function renderPromptMarkdown(source: string): string {
  const html = md.parse(source, { async: false }) as string;
  return DOMPurify.sanitize(html);
}
