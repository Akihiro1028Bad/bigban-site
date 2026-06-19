/**
 * 構成案テキスト ⇄ セクション(見出し＋1行説明)の相互変換(#52/#54)。
 * 承認画面が構成案をセクション単位で表示・編集・コメントするための純ロジック。
 * Notion 依存なし(クライアントから安全に import できる)。
 */

export interface OutlineSection {
  heading: string;
  description: string;
}

const HEADING_RE = /^#{1,6}\s+/;

/**
 * 構成案テキストをセクションに分割する。
 * - `#`〜`###` で始まる行を見出し、続く非見出し行を説明(結合)とする。
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
      current = { heading: line.replace(HEADING_RE, "").trim(), description: "" };
      sections.push(current);
    } else if (current) {
      current.description = current.description ? `${current.description} ${line}` : line;
    } else {
      // 見出しマーカーが無い行(旧フォーマット)は見出しのみのセクションにする。
      sections.push({ heading: line, description: "" });
    }
  }
  return sections;
}

/**
 * セクション配列を構成案テキストへ戻す(#54 手動編集の保存で使用)。
 * 各セクションを `## 見出し` ＋(説明があれば)説明行にし、空行で区切る。
 *
 * 注意(正規化の副作用): 旧フォーマット(`#` 無しの見出し行)由来のセクションも
 * `## 見出し` 形式へ正規化されて出力される。手動編集の保存(#54)で旧データを
 * 編集すると、構成案が新フォーマットへ書き換わる(意図的な移行・破壊ではない)。
 */
export function serializeOutlineSections(sections: readonly OutlineSection[]): string {
  return sections
    .map((s) => {
      const heading = `## ${s.heading.trim()}`;
      const description = s.description.trim();
      return description ? `${heading}\n${description}` : heading;
    })
    .join("\n\n");
}
