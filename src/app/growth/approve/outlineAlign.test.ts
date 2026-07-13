import { describe, expect, it } from "vitest";

import { parseOutlineSections, serializeOutlineSections } from "./outline";
import {
  alignOutlineSections,
  mergeOutlineSelection,
  sectionText,
} from "./outlineAlign";

const current = `## はじめに
説明A

## 遊び方
説明B

## まとめ
説明C`;

function allIds(items: NonNullable<ReturnType<typeof alignOutlineSections>>): Set<number> {
  return new Set(items.map((item) => item.id));
}

describe("alignOutlineSections", () => {
  it("同一テキストは全セクションを unchanged として返す", () => {
    const result = alignOutlineSections(current, current);

    expect(result?.map((item) => item.kind)).toEqual(["unchanged", "unchanged", "unchanged"]);
    expect(result?.map((item) => item.id)).toEqual([0, 1, 2]);
  });

  it("説明文だけの変更は modified として対応付ける", () => {
    const result = alignOutlineSections(current, current.replace("説明B", "新しい説明B"));

    expect(result?.[1]).toMatchObject({ kind: "modified", before: { heading: "遊び方" }, after: { heading: "遊び方" } });
  });

  it.each([
    ["先頭", "## 新規\n説明X\n\n" + current, ["added", "unchanged", "unchanged", "unchanged"]],
    ["中間", current.replace("## 遊び方", "## 新規\n説明X\n\n## 遊び方"), ["unchanged", "added", "unchanged", "unchanged"]],
    ["末尾", current + "\n\n## 新規\n説明X", ["unchanged", "unchanged", "unchanged", "added"]],
  ])("セクションを%sに追加する", (_position, proposal, kinds) => {
    expect(alignOutlineSections(current, proposal)?.map((item) => item.kind)).toEqual(kinds);
  });

  it("削除を removed として返す", () => {
    const proposal = current.replace("## 遊び方\n説明B\n\n", "");

    expect(alignOutlineSections(current, proposal)?.map((item) => item.kind)).toEqual([
      "unchanged", "removed", "unchanged",
    ]);
  });

  it("LCS ギャップ内の見出しリネームを modified として返す", () => {
    const proposal = current.replace("## 遊び方", "## 初心者の遊び方");
    const result = alignOutlineSections(current, proposal);

    expect(result?.[1]).toMatchObject({
      kind: "modified",
      before: { heading: "遊び方" },
      after: { heading: "初心者の遊び方" },
    });
  });

  it("並べ替えとリネームが混在しても自然順に並べる", () => {
    const proposal = `## 遊び方を知る
説明B

## はじめに
説明A

## まとめ
説明C`;

    const result = alignOutlineSections(current, proposal);

    expect(result?.map((item) => item.kind)).toEqual(["added", "unchanged", "removed", "unchanged"]);
    expect(result?.[0]).toMatchObject({ after: { heading: "遊び方を知る" } });
  });

  it("同一見出しの並べ替えは部分反映せず全文差分へフォールバックする", () => {
    const proposal = `## 遊び方
説明B

## はじめに
説明A

## まとめ
説明C`;

    expect(alignOutlineSections(current, proposal)).toBeNull();
  });

  it("同名見出しも LCS の順序を保って対応付ける", () => {
    const before = `## 同名
一つ目

## 間
説明

## 同名
二つ目`;
    const after = `## 同名
一つ目を修正

## 間
説明

## 同名
二つ目`;

    const result = alignOutlineSections(before, after);

    expect(result?.map((item) => item.kind)).toEqual(["modified", "unchanged", "unchanged"]);
    expect(result?.[0]).toMatchObject({ after: { description: "一つ目を修正" } });
  });

  it("画像指示行を含むセクションを往復できる", () => {
    const before = `## コート
説明
[画像:宇宙人マスコット: コートを案内]`;
    const after = `## コート
説明を更新
[画像:宇宙人マスコット: コートを案内]`;
    const result = alignOutlineSections(before, after);

    expect(result?.[0]?.kind).toBe("modified");
    if (!result || result[0].kind !== "modified") throw new Error("expected modified");
    expect(sectionText(result[0].after)).toContain("[画像:宇宙人マスコット: コートを案内]");
  });

  it("どちらかが空なら null を返す", () => {
    expect(alignOutlineSections("", current)).toBeNull();
    expect(alignOutlineSections(current, " \n")).toBeNull();
  });
});

describe("mergeOutlineSelection", () => {
  const proposal = `## 導入
説明A

## 新しい遊び方
説明Bを更新

## 追加
説明X`;

  it("全選択は提案全文の正規化結果と等価", () => {
    const items = alignOutlineSections(current, proposal);
    if (!items) throw new Error("expected alignment");

    expect(mergeOutlineSelection(items, allIds(items))).toBe(
      serializeOutlineSections(parseOutlineSections(proposal)),
    );
  });

  it("全非選択は現構成案の正規化結果と等価", () => {
    const items = alignOutlineSections(current, proposal);
    if (!items) throw new Error("expected alignment");

    expect(mergeOutlineSelection(items, new Set())).toBe(
      serializeOutlineSections(parseOutlineSections(current)),
    );
  });

  it("modified / added / removed を部分選択できる", () => {
    const before = `## A
前

## B
消える

## C
残る`;
    const after = `## X
追加

## A
後

## C
残る`;
    const items = alignOutlineSections(before, after);
    if (!items) throw new Error("expected alignment");

    const modified = items.find((item) => item.kind === "modified");
    const added = items.find((item) => item.kind === "added");
    const removed = items.find((item) => item.kind === "removed");
    expect(modified && added && removed).toBeTruthy();
    if (!modified || !added || !removed) throw new Error("expected all kinds");

    expect(mergeOutlineSelection(items, new Set([modified.id, added.id]))).toBe(`## X\n追加\n\n## A\n後\n\n## B\n消える\n\n## C\n残る`);
    expect(mergeOutlineSelection(items, new Set([removed.id]))).toBe("## A\n前\n\n## C\n残る");
  });
});
