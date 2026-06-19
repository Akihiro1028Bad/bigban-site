/**
 * 構成案テキスト ⇄ セクション(見出し＋1行説明＋画像指示)の相互変換(#52/#54/#60)。
 * 承認画面が構成案をセクション単位で表示・編集・コメント・画像指示するための純ロジック。
 * Notion 依存なし(クライアントから安全に import できる)。
 */

/** 本文画像のスタイルキー(#60)。すべて AI 生成。 */
export type ImageStyleKey = "mascot" | "minimal" | "diagram";

/** スタイルキー ↔ 表示名(承認画面のドロップダウン・構成案トークンで使う)。 */
export const IMAGE_STYLES: readonly { key: ImageStyleKey; label: string }[] = [
  { key: "mascot", label: "マスコット・コスミック" },
  { key: "minimal", label: "ミニマル図解" },
  { key: "diagram", label: "詳しい図解" },
];

// マッピングは IMAGE_STYLES を単一ソースに導出する(追加・変更を1箇所に)。
const LABEL_BY_KEY = Object.fromEntries(
  IMAGE_STYLES.map((s) => [s.key, s.label])
) as Record<ImageStyleKey, string>;

const KEY_BY_LABEL = Object.fromEntries(
  IMAGE_STYLES.map((s) => [s.label, s.key])
) as Record<string, ImageStyleKey>;

/** 表示名 → スタイルキー。未知の表示名は null(画像として採用しない)。 */
export function imageStyleKeyFromLabel(label: string): ImageStyleKey | null {
  return KEY_BY_LABEL[label.trim()] ?? null;
}

/** 1 セクションに紐づく本文画像の指示。 */
export interface OutlineImage {
  style: ImageStyleKey;
  description: string;
}

export interface OutlineSection {
  heading: string;
  description: string;
  /** 画像指示。parse は常に配列を設定する(空でも []). */
  images: OutlineImage[];
}

const HEADING_RE = /^#{1,6}\s+/;

// 画像指示トークン: [画像:<表示名>: <説明>]。コロンは半角/全角どちらも許容。
// 1 行に複数トークンも可(global)。表示名・説明はそれぞれ閉じ括弧/コロンを含まない。
// 注: この定数は matchAll(内部でコピーを作る)と replace(lastIndex をリセット)からのみ使う。
//     exec での共有はしないこと(lastIndex 汚染を避けるため)。
const IMAGE_DIRECTIVE_RE = /\[画像[:：]\s*([^:：\]]+?)\s*[:：]\s*([^\]]+?)\s*\]/g;

/**
 * 1 行から画像指示を抽出する。
 * 不正な表示名・説明が空のトークンは採用しない(沈黙させず、呼び出し側で通常テキスト扱い)。
 */
export function parseImageDirectives(line: string): OutlineImage[] {
  const out: OutlineImage[] = [];
  for (const match of line.matchAll(IMAGE_DIRECTIVE_RE)) {
    const style = imageStyleKeyFromLabel(match[1]);
    const description = match[2].trim();
    if (style && description) out.push({ style, description });
  }
  return out;
}

/** 画像指示 1 件をトークン文字列にする。 */
export function serializeImageDirective(image: OutlineImage): string {
  return `[画像:${LABEL_BY_KEY[image.style]}: ${image.description.trim()}]`;
}

/**
 * 構成案テキストをセクションに分割する。
 * - `#`〜`######` で始まる行を見出し、続く非見出し行を説明(結合)とする。
 * - 画像指示だけからなる行は説明に混ぜず、直前の見出しの images[] に振り分ける。
 * - 見出しの前に現れた非見出し行は、見出しのみのセクションとして扱う(後方互換)。
 * - 空行は区切りとして無視。空文字は []。
 */
export function parseOutlineSections(outline: string): OutlineSection[] {
  const sections: OutlineSection[] = [];
  let current: OutlineSection | null = null;
  for (const raw of outline.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    if (HEADING_RE.test(line)) {
      current = {
        heading: line.replace(HEADING_RE, "").trim(),
        description: "",
        images: [],
      };
      sections.push(current);
      continue;
    }
    // 画像指示「だけ」の行(他のテキストを含まない)なら、現在の見出しの画像にする。
    // テキストと画像トークンが同一行に混在する場合は、行全体を説明として残す
    // (トークンは画像化せずリテラルのまま。UI は画像指示を単独行で書く=#61)。
    const images = parseImageDirectives(line);
    const withoutImages = line.replace(IMAGE_DIRECTIVE_RE, "").trim();
    if (current && images.length > 0 && withoutImages === "") {
      current.images.push(...images);
      continue;
    }
    if (current) {
      current.description = current.description
        ? `${current.description} ${line}`
        : line;
    } else {
      // 見出しマーカーが無い行(旧フォーマット)は見出しのみのセクションにする。
      sections.push({ heading: line, description: "", images: [] });
    }
  }
  return sections;
}

/**
 * セクション配列を構成案テキストへ戻す(#54 手動編集の保存で使用)。
 * 各セクションを `## 見出し` ＋(説明があれば)説明行 ＋(画像があれば)画像指示行にし、
 * 空行で区切る。
 *
 * 注意(正規化の副作用): 旧フォーマット(`#` 無しの見出し行)由来のセクションも
 * `## 見出し` 形式へ正規化されて出力される。手動編集の保存(#54)で旧データを
 * 編集すると、構成案が新フォーマットへ書き換わる(意図的な移行・破壊ではない)。
 */
export function serializeOutlineSections(sections: readonly OutlineSection[]): string {
  return sections
    .map((s) => {
      const parts = [`## ${s.heading.trim()}`];
      const description = s.description.trim();
      if (description) parts.push(description);
      for (const image of s.images) parts.push(serializeImageDirective(image));
      return parts.join("\n");
    })
    .join("\n\n");
}
