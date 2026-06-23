// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { FlexBubble } from "./digest-flex";
import {
  buildReviseFailFlex,
  buildRevisePresentFlex,
  excerptLines,
} from "./revise-flex";

describe("excerptLines", () => {
  it("先頭 maxLines 行を抜き出す(空行は除外)", () => {
    expect(excerptLines("見出し1\n\n本文\n見出し2\n余分", 2)).toBe("見出し1\n本文");
  });

  it("空文字は空文字", () => {
    expect(excerptLines("", 3)).toBe("");
  });

  it("行数が maxLines 以下なら全行返す", () => {
    expect(excerptLines("a\nb", 5)).toBe("a\nb");
  });
});

describe("buildRevisePresentFlex（#138 / #139 B）", () => {
  const flex = buildRevisePresentFlex({
    title: "市川の記事",
    approveUrl: "https://x/growth/approve",
    instructionCount: 3,
    proposalExcerpt: "導入\nH2基準",
  }) as FlexBubble;

  it("バブルで、ヘッダに『修正案ができました』を含む", () => {
    expect(flex.type).toBe("bubble");
    expect(JSON.stringify(flex.header)).toContain("修正案ができました");
  });

  it("構成案のみ: タイトル・反映件数・抜粋を含む(3要素)", () => {
    const body = JSON.stringify(flex.body);
    expect(body).toContain("市川の記事");
    expect(body).toContain("3件");
    expect(body).toContain("導入");
    expect(flex.body?.contents).toHaveLength(3);
  });

  it("フッタは承認画面への URI ボタン", () => {
    const footer = JSON.stringify(flex.footer);
    expect(footer).toContain("https://x/growth/approve");
    expect(footer).toContain("承認画面で確認");
  });

  it("タイトルのみ(件数0・抜粋なし): 件数行を出さず新タイトル行を出す(2要素)", () => {
    const f = buildRevisePresentFlex({
      title: "T",
      approveUrl: "u",
      instructionCount: 0,
      proposalExcerpt: "",
      titleProposal: "梅雨でも打てる屋内の選び方",
    }) as FlexBubble;
    const body = JSON.stringify(f.body);
    expect(body).not.toContain("件の修正指示");
    expect(body).toContain("梅雨でも打てる屋内の選び方");
    expect(f.body?.contents).toHaveLength(2); // タイトル + 新タイトル行
  });

  it("構成案+タイトル両方: 件数・抜粋・新タイトルを含む(4要素)", () => {
    const f = buildRevisePresentFlex({
      title: "T",
      approveUrl: "u",
      instructionCount: 2,
      proposalExcerpt: "導入",
      titleProposal: "新しいタイトル",
    }) as FlexBubble;
    const body = JSON.stringify(f.body);
    expect(body).toContain("2件");
    expect(body).toContain("導入");
    expect(body).toContain("新しいタイトル");
    expect(f.body?.contents).toHaveLength(4); // タイトル + 件数 + 新タイトル + 抜粋
  });

  it("件数0・抜粋なし・タイトルなしならタイトル行のみ(1要素)", () => {
    const f = buildRevisePresentFlex({
      title: "T",
      approveUrl: "u",
      instructionCount: 0,
      proposalExcerpt: "",
    }) as FlexBubble;
    expect(f.body?.contents).toHaveLength(1);
  });
});

describe("buildReviseFailFlex（#138）", () => {
  const flex = buildReviseFailFlex({
    title: "市川の記事",
    approveUrl: "https://x/growth/approve",
    reason: "504",
  }) as FlexBubble;

  it("エラーヘッダ・理由・再依頼導線・承認画面ボタンを含む", () => {
    expect(JSON.stringify(flex.header)).toContain("失敗");
    const body = JSON.stringify(flex.body);
    expect(body).toContain("市川の記事");
    expect(body).toContain("504");
    expect(body).toContain("やり直し");
    expect(JSON.stringify(flex.footer)).toContain("https://x/growth/approve");
  });
});
