import { describe, expect, it } from "vitest";

import { evaluatePublishGate } from "./publishGate";

const DISCLAIMER = "※この記事はAIが作成した下書きです。公開前に内容をご確認ください。";

describe("evaluatePublishGate", () => {
  it("AI免責文があり断定NGが無ければ ok=true・理由なし", () => {
    const result = evaluatePublishGate({
      title: "本八幡で、雨の日もピックルボール",
      bodyHtml: `<h2>屋内で打てる</h2><p>本八幡駅すぐの屋内コートです。${DISCLAIMER}</p>`,
    });
    expect(result.ok).toBe(true);
    expect(result.blockReasons).toEqual([]);
  });

  it("AI免責文が欠けていれば block(理由に『AI免責文』を含む)", () => {
    const result = evaluatePublishGate({
      title: "屋内コートの話",
      bodyHtml: `<h2>屋内で打てる</h2><p>本八幡駅すぐの屋内コートです。</p>`,
    });
    expect(result.ok).toBe(false);
    expect(result.blockReasons.some((r) => r.includes("AI免責文"))).toBe(true);
  });

  it("§13 の断定NG(料金)があれば block(理由に『断定NG』を含む)", () => {
    const result = evaluatePublishGate({
      title: "料金の話",
      bodyHtml: `<p>1時間2,000円で遊べます。${DISCLAIMER}</p>`,
    });
    expect(result.ok).toBe(false);
    expect(result.blockReasons.some((r) => r.includes("断定NG"))).toBe(true);
  });

  it("複数の block を理由としてまとめて返す", () => {
    const result = evaluatePublishGate({
      title: "営業時間と料金",
      bodyHtml: `<p>営業時間は9時から。月額8,000円です。</p>`,
    });
    expect(result.ok).toBe(false);
    // 免責文欠落 + 断定NG の2系統
    expect(result.blockReasons.length).toBeGreaterThanOrEqual(2);
  });

  it("knownNewsPaths を渡すと壊れた内部リンクを block にする", () => {
    const result = evaluatePublishGate({
      title: "回遊リンク",
      bodyHtml: `<p>詳しくは<a href="/ja/news/missing-article">こちら</a>。${DISCLAIMER}</p>`,
      knownNewsPaths: new Set<string>(["/ja/news/existing"]),
    });
    expect(result.ok).toBe(false);
    expect(result.blockReasons.some((r) => r.includes("内部リンク先"))).toBe(true);
  });

  it("本文・タイトルが空でも理由文字列を組み立てられる(欠落耐性)", () => {
    const result = evaluatePublishGate({ title: "", bodyHtml: "" });
    // 本文空=免責文も無いので block。理由は非空。
    expect(result.ok).toBe(false);
    expect(result.blockReasons.every((r) => r.length > 0)).toBe(true);
  });
});
