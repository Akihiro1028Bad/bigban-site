import { describe, expect, it } from "vitest";

import { compareArticles, scoreArticle } from "./articleEval";

const DISCLAIMER = "※この記事はAIが作成した下書きです。公開前に内容をご確認ください。";

const cleanBody = `<h2>屋内で打てる</h2><p>本八幡駅すぐの屋内コート。卓球経験者なら最初のラリーから続く。詳しくは<a href="/ja/news/start">入門</a>へ。<img src="/x.png" alt="図"></p><p>${DISCLAIMER}</p>`;

describe("scoreArticle", () => {
  it("block / warn / ok を集計する", () => {
    const score = scoreArticle({ title: "本八幡で雨でも打てる", bodyHtml: cleanBody });
    expect(score.blocked).toBe(false);
    expect(score.block).toBe(0);
    expect(score.ok).toBeGreaterThan(0);
    expect(score.block + score.warn + score.ok).toBe(score.checks.length);
  });

  it("AI免責文欠落・明確な禁止表現は block にカウントされる", () => {
    const score = scoreArticle({
      title: "営業時間の話",
      bodyHtml: `<p>24時間営業です。</p>`,
    });
    expect(score.blocked).toBe(true);
    expect(score.block).toBeGreaterThanOrEqual(2);
  });

  it("確認済みのイベント事実はblockに数えない", () => {
    const fact = "体験会は7月20日に開催します";
    const score = scoreArticle({
      title: "体験会",
      bodyHtml: `<h2>体験会</h2><p>${fact}。${DISCLAIMER}</p>`,
      confirmedFacts: [fact],
    });
    expect(score.blocked).toBe(false);
  });
});

describe("compareArticles", () => {
  it("block が減れば improved", () => {
    const before = { title: "t", bodyHtml: `<p>月額8,000円。</p>` };
    const after = { title: "t", bodyHtml: cleanBody };
    const cmp = compareArticles(before, after);
    expect(cmp.blockDelta).toBeLessThan(0);
    expect(cmp.verdict).toBe("improved");
  });

  it("block 同数で warn が増えれば regressed", () => {
    const before = { title: "本八幡で雨でも打てる", bodyHtml: cleanBody };
    // 見出し・画像・内部リンクを削ると warn が増える(block は据え置き)
    const after = { title: "本八幡で雨でも打てる", bodyHtml: `<p>短い本文。${DISCLAIMER}</p>` };
    const cmp = compareArticles(before, after);
    expect(cmp.blockDelta).toBe(0);
    expect(cmp.warnDelta).toBeGreaterThan(0);
    expect(cmp.verdict).toBe("regressed");
  });

  it("block が増えれば regressed", () => {
    const before = { title: "本八幡で雨でも打てる", bodyHtml: cleanBody };
    const after = { title: "本八幡で雨でも打てる", bodyHtml: `<p>24時間営業です。</p>` };
    const cmp = compareArticles(before, after);
    expect(cmp.blockDelta).toBeGreaterThan(0);
    expect(cmp.verdict).toBe("regressed");
  });

  it("block 同数で warn が減れば improved", () => {
    // before: 見出し/画像/内部リンクが不足(warn 多) → after: cleanBody(warn 少)。block は両方0。
    const before = { title: "本八幡で雨でも打てる", bodyHtml: `<p>短い本文。${DISCLAIMER}</p>` };
    const after = { title: "本八幡で雨でも打てる", bodyHtml: cleanBody };
    const cmp = compareArticles(before, after);
    expect(cmp.blockDelta).toBe(0);
    expect(cmp.warnDelta).toBeLessThan(0);
    expect(cmp.verdict).toBe("improved");
  });

  it("変化が無ければ unchanged", () => {
    const cmp = compareArticles(
      { title: "本八幡で雨でも打てる", bodyHtml: cleanBody },
      { title: "本八幡で雨でも打てる", bodyHtml: cleanBody }
    );
    expect(cmp.verdict).toBe("unchanged");
  });
});
