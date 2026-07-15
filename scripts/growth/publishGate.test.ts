import { describe, expect, it } from "vitest";

import {
  evaluatePublishGate,
  evaluateRegate,
  publishGateReason,
  resolveGateArticleType,
} from "./publishGate";
import { bindingBodyHash } from "./factBindingMetadata";

const DISCLAIMER = "※この記事はAIが作成した下書きです。公開前に内容をご確認ください。";

describe("evaluatePublishGate", () => {
  it("検証後に本文が変わったbindingを公開blockする", () => {
    const original = `<p>料金は500円です。${DISCLAIMER}</p>`;
    const changed = `<p>料金は600円です。${DISCLAIMER}</p>`;
    const factBinding = { version: 1, bodyHash: bindingBodyHash(original), referenceCount: 1, isValid: true };
    expect(evaluatePublishGate({ title: "料金", bodyHtml: original, factBinding }).ok).toBe(true);
    const result = evaluatePublishGate({ title: "料金", bodyHtml: changed, factBinding });
    expect(result.ok).toBe(false);
    expect(result.blockReasons.some((reason) => reason.includes("fact binding"))).toBe(true);
  });
  it("fact markerが残った本文を公開不可にする", () => {
    const result = evaluatePublishGate({
      title: "料金",
      bodyHtml: `<p>料金は500円<!--FACT:fact-price-->。${DISCLAIMER}</p>`,
    });
    expect(result.ok).toBe(false);
    expect(result.blockReasons.some((reason) => reason.includes("FACT marker"))).toBe(true);
  });
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

  it("公式料金・徒歩分数・長い承認済みタイトルは gate を通る", () => {
    const result = evaluatePublishGate({
      title: "ピックルボール、市川市でどこでできる？場所の選び方ガイド【体育館・クラブ・屋内専用施設】",
      bodyHtml: `<h2>市民体育館</h2><p>一般230円・市外690円です。</p><h2>屋内専用施設</h2><p>本八幡駅から徒歩3分です。${DISCLAIMER}</p>`,
    });
    expect(result.ok).toBe(true);
    expect(result.blockReasons).toEqual([]);
  });

  it("公式確認済みのイベント日時はwarnに留め、未確認ならblockする", () => {
    const bodyHtml = `<h2>体験会</h2><p>体験会は7月20日に開催します。${DISCLAIMER}</p>`;
    expect(evaluatePublishGate({ title: "体験会", bodyHtml }).ok).toBe(false);
    expect(
      evaluatePublishGate({
        title: "体験会",
        bodyHtml,
        confirmedFacts: ["体験会は7月20日に開催します"],
      }).ok
    ).toBe(true);
  });

  it("複数の block を理由としてまとめて返す", () => {
    const result = evaluatePublishGate({
      title: "禁止表現",
      bodyHtml: `<script>alert(1)</script><p>24時間営業です。</p>`,
    });
    expect(result.ok).toBe(false);
    // 免責文欠落 + 禁止表現 + HTML安全性
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

  it("knownNewsPaths 未指定なら壊れた内部リンクは検査しない", () => {
    const result = evaluatePublishGate({
      title: "回遊リンク",
      bodyHtml: `<p>詳しくは<a href="/ja/news/missing-article">こちら</a>。${DISCLAIMER}</p>`,
    });
    expect(result.ok).toBe(true);
    expect(result.blockReasons).toEqual([]);
  });

  it("#218レビュー対応: CTA必須文「本八幡駅から徒歩1分」は gate を通る(draftQuality 委譲)", () => {
    const result = evaluatePublishGate({
      title: "アクセス抜群の屋内コート",
      bodyHtml: `<p>本八幡駅から徒歩1分。営業時間は6:00-23:00です。${DISCLAIMER}</p>`,
    });
    expect(result.ok).toBe(true);
    expect(result.blockReasons).toEqual([]);
  });

  it("徒歩5分は要出典 warn のため gate を止めない", () => {
    const result = evaluatePublishGate({
      title: "アクセスの話",
      bodyHtml: `<p>最寄り駅から徒歩5分ほどです。${DISCLAIMER}</p>`,
    });
    expect(result.ok).toBe(true);
    expect(result.blockReasons).toEqual([]);
  });

  it("styleLint の文体注意 warn は blockReasons に入らない", () => {
    const result = evaluatePublishGate({
      title: "文体チェック",
      bodyHtml: `<p>この記事では最高の始め方を紹介します。${DISCLAIMER}</p>`,
    });

    expect(result.ok).toBe(true);
    expect(result.blockReasons).toEqual([]);
  });

  it("本文・タイトルが空でも理由文字列を組み立てられる(欠落耐性)", () => {
    const result = evaluatePublishGate({ title: "", bodyHtml: "" });
    // 本文空=免責文も無いので block。理由は非空。
    expect(result.ok).toBe(false);
    expect(result.blockReasons.every((r) => r.length > 0)).toBe(true);
  });
});

describe("publishGateReason", () => {
  it("block があれば理由文字列を返す", () => {
    const reason = publishGateReason(
      "<p>本文です。</p>",
      "屋内コートの話",
      "single",
      undefined
    );
    expect(reason).toContain("AI免責文");
  });

  it("block が無ければ null を返す", () => {
    const reason = publishGateReason(
      `<p>本八幡駅すぐの屋内コートです。${DISCLAIMER}</p>`,
      "屋内ピックルボール入門",
      "single",
      undefined
    );
    expect(reason).toBeNull();
  });

  it("免責文を含む raw 本文では §5 免責欠落 block が誤発火しない", () => {
    const rawBody = `<p>公開前に読む本文です。</p><p>${DISCLAIMER}</p>`;
    const reason = publishGateReason(rawBody, "公開直前の確認", "single", undefined);
    expect(reason).toBeNull();
  });
});

describe("evaluateRegate", () => {
  it("新規 block のみ newBlocks に含める", () => {
    const result = evaluateRegate({
      before: `<p>1時間2,000円です。${DISCLAIMER}</p>`,
      after: `<p>1時間2,000円です。営業時間は9時からです。</p>`,
      title: "料金の話",
    });
    expect(result.ok).toBe(false);
    expect(result.newBlocks.some((r) => r.includes("AI免責文"))).toBe(true);
    expect(result.newBlocks.some((r) => r.includes("禁止表現"))).toBe(false);
  });

  it("既存 block だけなら ok=true", () => {
    const result = evaluateRegate({
      before: "<p>本文です。</p>",
      after: "<p>本文を少し直しました。</p>",
      title: "免責なしの既存 block",
    });
    expect(result.ok).toBe(true);
    expect(result.newBlocks).toEqual([]);
  });

  it("after で新しい block が発生したら ok=false", () => {
    const result = evaluateRegate({
      before: `<p>本文です。${DISCLAIMER}</p>`,
      after: "<p>本文です。</p>",
      title: "AI修正適用",
    });
    expect(result.ok).toBe(false);
    expect(result.newBlocks.some((r) => r.includes("AI免責文"))).toBe(true);
  });
});

describe("resolveGateArticleType", () => {
  it("cornerstone フラグが true なら cornerstone を返す", () => {
    expect(resolveGateArticleType({ cornerstone: true })).toBe("cornerstone");
  });

  it("cornerstone フラグ無し・false・文字列 articleType は single を返す", () => {
    expect(resolveGateArticleType({})).toBe("single");
    expect(resolveGateArticleType({ cornerstone: false })).toBe("single");
    expect(resolveGateArticleType({ articleType: "獲得" })).toBe("single");
  });
});
