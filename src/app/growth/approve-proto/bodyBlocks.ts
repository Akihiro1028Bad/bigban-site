/**
 * 本文コメント(#proto・#182)用の本文HTML解析。DOM非依存の純ロジック。
 *
 * 本文(bodyHtml)をトップレベル要素(段落/見出し/リスト/引用)に分割し、
 * 段落は文単位・リストは項目単位の「行」に割って、行ごとにコメントを付けられるようにする。
 * 修正反映は段落=文追記 / リスト=項目追記 と決定的に行い、壊れない置換に限定する。
 */

export interface Block {
  index: number;
  tag: string;
  inner: string;
  raw: string;
}

export interface BlockRow {
  /** その行の表示テキスト(タグ除去済み)。 */
  text: string;
  /** コメント可能か(段落の文・リスト項目のみ true)。 */
  commentable: boolean;
}

const BLOCK_TAGS = "h2|h3|p|ul|ol|blockquote|figure";

export function splitBlocks(html: string): Block[] {
  const re = new RegExp(`<(${BLOCK_TAGS})\\b[^>]*>([\\s\\S]*?)</\\1>`, "gi");
  const blocks: Block[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(html)) !== null) {
    blocks.push({ index: i, tag: m[1].toLowerCase(), inner: m[2], raw: m[0] });
    i += 1;
  }
  return blocks;
}

export function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** ブロックを表示用の行へ割る(段落=文 / リスト=項目 / その他=1行)。 */
export function blockRows(block: Block): BlockRow[] {
  if (block.tag === "p") {
    const text = stripTags(block.inner);
    const sentences = text.split(/(?<=[。！？])/).map((s) => s.trim()).filter(Boolean);
    return (sentences.length ? sentences : [text]).map((t) => ({ text: t, commentable: true }));
  }
  if (block.tag === "ul" || block.tag === "ol") {
    const items = [...block.inner.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((mm) => stripTags(mm[1]));
    return items.map((t) => ({ text: t, commentable: true }));
  }
  return [{ text: stripTags(block.inner), commentable: false }];
}

export function isCommentableTag(tag: string): boolean {
  return tag === "p" || tag === "ul" || tag === "ol";
}

/** コメント指示から、追記する改善文(モック)を決める。 */
export function improvementSentence(commentText: string): string {
  const c = commentText ?? "";
  if (c.includes("具体") || c.includes("例")) {
    return "たとえば初回は、スタッフが横についてサーブとカウントだけ教えます。";
  }
  if (c.includes("根拠") || c.includes("数") || c.includes("データ")) {
    return "具体的な数値は確定し次第このあとに追記します。";
  }
  if (c.includes("リンク") || c.includes("導線")) {
    return "くわしくは施設紹介ページもあわせてご覧ください。";
  }
  if (c.includes("長") || c.includes("冗長") || c.includes("くどい")) {
    return "要点だけ言うと、まず一度コートに立ってみてください。";
  }
  return "ご指摘を踏まえ、読み手が次の一歩をイメージできる一文を補いました。";
}

/** ブロックに改善を反映(段落=文追記 / リスト=項目追記)。新しい bodyHtml を返す。 */
export function applyBlockImprovement(html: string, blockIndex: number, sentence: string): string {
  const blocks = splitBlocks(html);
  const target = blocks[blockIndex];
  if (!target) return html;
  let nextInner: string;
  if (target.tag === "ul" || target.tag === "ol") {
    nextInner = `${target.inner}<li>${sentence}</li>`;
  } else {
    nextInner = `${target.inner} ${sentence}`;
  }
  const nextRaw = `<${target.tag}>${nextInner}</${target.tag}>`;
  return blocks.map((b) => (b.index === blockIndex ? nextRaw : b.raw)).join("\n");
}
