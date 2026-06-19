// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseOutlineSections, serializeOutlineSections } from "./outline";

describe("parseOutlineSections", () => {
  it("見出し＋説明のセクションを分割する(空行区切り)", () => {
    const outline = "## 市川でできる場所は3つ\n屋外/体育館/屋内専用を整理\n\n## 屋内専用という選び方\n天候に左右されない利点";
    expect(parseOutlineSections(outline)).toEqual([
      { heading: "市川でできる場所は3つ", description: "屋外/体育館/屋内専用を整理" },
      { heading: "屋内専用という選び方", description: "天候に左右されない利点" },
    ]);
  });

  it("見出しのみ(説明なし)も扱う", () => {
    expect(parseOutlineSections("## A\n## B")).toEqual([
      { heading: "A", description: "" },
      { heading: "B", description: "" },
    ]);
  });

  it("旧フォーマット(#なしの行)は見出しのみセクションに落とす", () => {
    expect(parseOutlineSections("導入\n本論\nまとめ")).toEqual([
      { heading: "導入", description: "" },
      { heading: "本論", description: "" },
      { heading: "まとめ", description: "" },
    ]);
  });

  it("説明が複数行ならスペースで結合する", () => {
    expect(parseOutlineSections("## A\n行1\n行2")).toEqual([
      { heading: "A", description: "行1 行2" },
    ]);
  });

  it("見出し前の行は見出しのみセクション、以降は説明に入る", () => {
    expect(parseOutlineSections("前文\n## A\n説明")).toEqual([
      { heading: "前文", description: "" },
      { heading: "A", description: "説明" },
    ]);
  });

  it("旧フォーマットで見出し前に複数の#なし行が並ぶと、各行が独立セクションになる", () => {
    // 新フォーマットは各セクションが `## 見出し` で始まるため説明は迷子にならない。
    // 旧/混在データでは #なし行はそれぞれ見出しのみセクションになる(表示と index は一致)。
    expect(parseOutlineSections("前文\n補足\n## A\n説明")).toEqual([
      { heading: "前文", description: "" },
      { heading: "補足", description: "" },
      { heading: "A", description: "説明" },
    ]);
  });

  it("### など深い見出しもマーカーを外す。空行は無視・空文字は []", () => {
    expect(parseOutlineSections("###  深い見出し")).toEqual([
      { heading: "深い見出し", description: "" },
    ]);
    expect(parseOutlineSections("\n\n")).toEqual([]);
    expect(parseOutlineSections("")).toEqual([]);
  });
});

describe("serializeOutlineSections", () => {
  it("見出し＋説明を `## 見出し` ＋説明行・空行区切りに戻す", () => {
    expect(
      serializeOutlineSections([
        { heading: "A", description: "説明A" },
        { heading: "B", description: "" },
      ])
    ).toBe("## A\n説明A\n\n## B");
  });

  it("parse と往復できる(正規化後)", () => {
    const text = "## A\n説明A\n\n## B\n説明B";
    expect(serializeOutlineSections(parseOutlineSections(text))).toBe(text);
  });
});
