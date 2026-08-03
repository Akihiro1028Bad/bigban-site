// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { validateFactCoverage } from "./factCoverage";
import { recheckReasonForFactReference } from "./factBinding";
import {
  FACT_BINDING_VERSION,
  bindingBodyHash,
  bindingContainerTextHash,
  bindingReferencesMatchBody,
} from "./factBindingMetadata";
import type { StoredFactReference } from "./factBindingMetadata";
import type { ResearchFact } from "./draftPipeline";

function fact(id: string, statement: string, sourceLabel?: string): ResearchFact {
  return {
    id,
    statement,
    role: "detail",
    sourceType: "official-site",
    source: `https://example.com/${id}`,
    sourceLabel: sourceLabel ?? "公式サイト",
    isStatistic: undefined,
    isHealthClaim: undefined,
    publishedYear: undefined,
  };
}

function coverage(bodyHtml: string, facts: ResearchFact[] = []) {
  return validateFactCoverage({ bodyHtml, facts });
}

const priceFact = fact(
  "fact-price",
  "コートレンタル料金は1面1時間あたり、平日6:00-9:00が4,980円、平日9:00-17:00が5,980円、平日17:00-23:00が7,980円、土日祝6:00-23:00が7,980円",
);

const priceTableRows = [
  "<tr><th>時間帯</th><th>料金</th></tr>",
  "<tr><td>平日6:00-9:00</td><td>4,980円</td></tr>",
  "<tr><td>平日9:00-17:00</td><td>5,980円</td></tr>",
  "<tr><td>平日17:00-23:00</td><td>7,980円</td></tr>",
  "<tr><td>土日祝6:00-23:00</td><td>7,980円</td></tr>",
].join("");

describe("validateFactCoverage: 値カバレッジによるブロック判定", () => {
  it("アトムを含まない地域概況文はfactが無くても通る", () => {
    const bodyHtml = "<p>船橋市内でピックルボールを始める場合、現状は体育館で開かれる教室や地域クラブへの参加が中心の探し方になります。</p>";

    const result = coverage(bodyHtml);

    expect(result.cleanBodyHtml).toBe(bodyHtml);
    expect(result.references).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.binding).toEqual({
      version: FACT_BINDING_VERSION,
      bodyHash: bindingBodyHash(bodyHtml),
    });
  });

  it("factを言い換えた文は通り、warningsも空になる", () => {
    const mapFact = fact(
      "fact-map",
      "施設マップは各施設への問い合わせを案内している",
      "千葉県ピックルボール協会",
    );

    const result = coverage(
      "<p>同マップは、掲載施設について空き状況や利用可否を各施設へ問い合わせるよう案内しています。</p>",
      [mapFact],
    );

    expect(result.warnings).toEqual([]);
  });

  it("料金factに裏付けられた料金表は列見出しの字面に関係なく通る", () => {
    expect(() => coverage(`<table>${priceTableRows}</table>`, [priceFact])).not.toThrow();
  });

  it("factに無い値をすべて1メッセージへ列挙してblockする", () => {
    const broken = `<table><tr><th>時間帯</th><th>料金</th></tr><tr><td>平日6:00-10:00</td><td>4,500円</td></tr></table>`;

    let message = "";
    try {
      coverage(broken, [priceFact]);
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }

    expect(message).toBe("根拠のない値があります: 6:00-10:00(時刻) / 4,500円(金額)");
  });

  it("同じ値の違反はメッセージ内で重複させない", () => {
    expect(() => coverage(
      "<p>料金は4,500円です。</p><p>やはり料金は4,500円です。</p>",
      [priceFact],
    )).toThrow("根拠のない値があります: 4,500円(金額)");
  });

  it("セル内の複数文もfact群で裏付けられていれば通る", () => {
    const facts = [
      fact("fact-fee", "月4回で月謝6,600円、体験料1,650円"),
      fact("fact-bring", "持ち物は運動しやすい服装、室内シューズ、飲み物"),
    ];

    expect(() => coverage(
      "<table><tr><td>月4回で月謝6,600円、体験料1,650円。持ち物は運動しやすい服装、室内シューズ、飲み物</td></tr></table>",
      facts,
    )).not.toThrow();
  });

  it.each([
    ["健康断定", "<p>継続すると血圧を下げます。</p>", "血圧を下げます(健康)"],
    ["統計語", "<p>調査では平均25%でした。</p>", "調査では(統計)"],
    ["日付", "<p>開催日は2026年4月17日です。</p>", "2026年4月17日(日付)"],
    ["数量", "<p>コートは3面あります。</p>", "3面(数量)"],
  ])("%sはfactが無ければblockする", (_label, html, expected) => {
    expect(() => coverage(html)).toThrow(new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("表セルの裸数値はfactに無ければblockする", () => {
    expect(() => coverage("<table><tr><th>面数</th></tr><tr><td>500</td></tr></table>"))
      .toThrow("根拠のない値があります: 500(統計)");
  });

  it("日付に含まれる数量と、他アトムに覆われた裸数値は二重計上しない", () => {
    const dateFact = fact("fact-date", "開催日は2026年4月17日、定員は20人");

    expect(() => coverage(
      "<table><tr><td>2026年4月17日</td><td>20人</td></tr></table>",
      [dateFact],
    )).not.toThrow();
  });

  it("container外の可視テキストは従来どおりrejectし、画像markerは許可する", () => {
    expect(() => coverage("<h2>料金</h2><strong>参加費は500円です。</strong>")).toThrow(/container外/);
    expect(() => coverage("<h2>画像</h2>\n{{IMG:1}}\n<p>説明です。</p>")).not.toThrow();
  });
});

describe("validateFactCoverage: marker除去", () => {
  it("紛れ込んだfact markerを除去し、判定には影響させない", () => {
    const result = coverage(
      "<p>参加費は500円<!--FACT:fact-x-->です<!-- FACT:fact-y,fact-z -->。</p>",
      [fact("fact-fee", "参加費は500円")],
    );

    expect(result.cleanBodyHtml).toBe("<p>参加費は500円です。</p>");
    expect(result.cleanBodyHtml).not.toContain("FACT:");
    expect(result.binding.bodyHash).toBe(bindingBodyHash("<p>参加費は500円です。</p>"));
  });
});

describe("validateFactCoverage: 台帳の機械逆引き", () => {
  const storedFactReferenceSchema = z.object({
    factId: z.string().regex(/^fact-[a-z0-9-]+$/i),
    excerpt: z.string().min(1),
    container: z.enum(["p", "li", "th", "td"]),
    containerIndex: z.number().int().positive(),
    sectionPath: z.string(),
    containerTextHash: z.string().min(1),
    containerMatchCount: z.number().int().positive(),
  });

  it("値の一致箇所からFactReferenceを生成し、本文照合と再確認判定に使える", () => {
    const bodyHtml = "<h2>料金</h2><p>コートレンタル料金は平日6:00-9:00が4,980円です。</p>";
    const result = coverage(bodyHtml, [priceFact]);
    const stored: StoredFactReference[] = result.references;

    expect(result.references).toEqual([{
      factId: "fact-price",
      excerpt: "コートレンタル料金は平日6:00-9:00が4,980円です",
      sectionPath: "料金",
      container: "p",
      containerIndex: 1,
      containerTextHash: bindingContainerTextHash("コートレンタル料金は平日6:00-9:00が4,980円です。"),
      containerMatchCount: 1,
      claimKinds: ["time", "price"],
    }]);
    expect(() => result.references.map((reference) => storedFactReferenceSchema.parse(reference))).not.toThrow();
    expect(bindingReferencesMatchBody(result.cleanBodyHtml, stored)).toBe(true);
    expect(recheckReasonForFactReference(priceFact.statement, result.references[0].excerpt, [])).toBe("料金");
  });

  it("表セルはセル全文を抜粋にし、同一本文セルのcontainerMatchCountを数える", () => {
    const result = coverage(`<table>${priceTableRows}</table>`, [priceFact]);

    expect(result.references).toHaveLength(8);
    expect(result.references.every((reference) => reference.factId === "fact-price")).toBe(true);
    expect(result.references[0]).toMatchObject({
      container: "td",
      containerIndex: 1,
      excerpt: "平日6:00-9:00",
      claimKinds: ["time"],
    });
    expect(result.references.at(-1)).toMatchObject({
      excerpt: "7,980円",
      containerMatchCount: 2,
    });
    expect(bindingReferencesMatchBody(result.cleanBodyHtml, result.references)).toBe(true);
  });

  it("句点で終わらない文と、固有名詞一致も抜粋できる", () => {
    const facts = [fact("fact-org", "日本ピックルボール協会が運営", "日本ピックルボール協会")];

    const result = coverage("<ul><li>運営は日本ピックルボール協会</li></ul>", facts);

    expect(result.references).toEqual([{
      factId: "fact-org",
      excerpt: "運営は日本ピックルボール協会",
      sectionPath: "",
      container: "li",
      containerIndex: 1,
      containerTextHash: bindingContainerTextHash("運営は日本ピックルボール協会"),
      containerMatchCount: 1,
      claimKinds: ["proper-noun"],
    }]);
  });

  it("同じfactが同じ抜粋で複数回一致しても1行へまとめる", () => {
    const feeFact = fact("fact-fee", "参加費は500円、定員は20人");

    const result = coverage("<p>参加費は500円、定員は20人です。</p>", [feeFact]);

    expect(result.references).toHaveLength(1);
    expect(result.references[0].claimKinds).toEqual(["price", "quantity"]);
  });

  // v2 では固有名詞だけの一般文は reference を持たないのが正常。公開直前ゲート
  // (draftQuality → bindingReferencesMatchBody)がそれを未束縛主張と誤認すると、
  // 8/3 incident ②(一般名詞の誤検知)が公開側で再発する。
  it("施設語を含む一般文と料金文が混在しても公開直前ゲートを通る", () => {
    const bodyHtml = [
      "<h2>船橋の現状</h2>",
      "<p>船橋市内では、体育館で開かれる教室や地域クラブへの参加が中心です。</p>",
      "<p>平日6:00-9:00は1面1時間4,980円です。</p>",
    ].join("");

    const result = coverage(bodyHtml, [priceFact]);

    expect(result.references).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(bindingReferencesMatchBody(result.cleanBodyHtml, result.references)).toBe(true);
  });

  it("公開前の人手編集でfactに無い金額が加わると公開直前ゲートで検知される", () => {
    const result = coverage("<p>平日6:00-9:00は1面1時間4,980円です。</p>", [priceFact]);

    expect(bindingReferencesMatchBody(
      `${result.cleanBodyHtml}<p>直前に追加した特別料金は9,999円です。</p>`,
      result.references,
    )).toBe(false);
  });

  it("本文に現れないfactはreferencesに含めない", () => {
    const facts = [fact("fact-fee", "参加費は500円"), fact("fact-walk", "駅から徒歩3分")];

    const result = coverage("<p>参加費は500円です。</p>", facts);

    expect(result.references.map((reference) => reference.factId)).toEqual(["fact-fee"]);
  });
});

describe("validateFactCoverage: 移植したアトム抽出の網羅", () => {
  it("万円・千円・午前・午後・年月・月日を正規化して照合する", () => {
    const facts = [
      fact("fact-price", "参加費は10,000円、寄付は2,000円"),
      fact("fact-hours", "開始は0時、終了は21時"),
      fact("fact-term", "開始は2026年4月、開催日は2026-04-17"),
    ];

    expect(() => coverage([
      "<p>参加費は1万円、寄付は2千円です。</p>",
      "<p>開始は午前12時、終了は午後9時です。</p>",
      "<p>開始は2026年4月、開催日は4月17日です。</p>",
    ].join(""), facts)).not.toThrow();
  });

  it("英字固有名詞は語境界で判定し、部分一致は名称として扱わない", () => {
    const facts = [fact("fact-brand", "HYROX向け設備、pickle2 の記録、pickle の記録", "日本ピックルボール協会")];

    const result = coverage([
      "<p>HYROXエリアがあります。</p>",
      "<p>XHYROXQという語を紹介します。</p>",
      "<p>運営は日本ピックルボール協会です。</p>",
    ].join(""), facts);

    expect(result.references.map((reference) => reference.excerpt)).toEqual([
      "HYROXエリアがあります",
      "運営は日本ピックルボール協会です",
    ]);
    expect(result.warnings).toEqual([]);
  });

  it("sourceLabelなしfactのpublishedYearを発行年の根拠にし、H3まで見出し経路にする", () => {
    const statistic: ResearchFact = {
      id: "fact-stat",
      statement: "調査では平均25%",
      role: "detail",
      sourceType: "official-site",
      source: "https://example.com/stat",
      sourceLabel: undefined,
      isStatistic: true,
      isHealthClaim: undefined,
      publishedYear: 2024,
    };

    const result = coverage("<h2>参考資料</h2><h3>出典</h3><p>調査では平均25%（2024年）です。</p>", [statistic]);

    expect(result.references[0]).toMatchObject({
      factId: "fact-stat",
      sectionPath: "参考資料 > 出典",
      excerpt: "調査では平均25%(2024年)です",
    });
  });
});

describe("validateFactCoverage: 非ブロックのwarnings", () => {
  it("factに無い施設名はblockせずunverified-facility-nounとして報告する", () => {
    const result = coverage("<p>船橋市総合体育館の屋内コートで練習できます。</p>");

    expect(result.warnings).toEqual([{
      kind: "unverified-facility-noun",
      text: "船橋市総合体育館",
      excerpt: "船橋市総合体育館の屋内コートで練習できます",
    }]);
  });

  it("factに含まれる施設名はwarningsに載せない", () => {
    const orgFact = fact("fact-org", "千葉県ピックルボール協会が講師を派遣している");

    const result = coverage("<p>千葉県ピックルボール協会が講師を派遣しています。</p>", [orgFact]);

    expect(result.warnings).toEqual([]);
  });

  it("一般名詞の施設語と重複した検出はwarningsに積まない", () => {
    const result = coverage(
      "<p>地域クラブへの参加が中心になります。</p><p>船橋市総合体育館を使います。</p><p>船橋市総合体育館を使います。</p>",
    );

    expect(result.warnings).toEqual([{
      kind: "unverified-facility-noun",
      text: "船橋市総合体育館",
      excerpt: "船橋市総合体育館を使います",
    }]);
  });

  it("接尾辞だけが残る一般名詞はwarningsに載せない", () => {
    expect(coverage("<p>沿線の駅ごとに屋内コートを探す方法もあります。</p>").warnings).toEqual([]);
  });

  it("表セルの施設名はセル全文を抜粋にする", () => {
    const result = coverage("<table><tr><td>西船橋駅から近い</td></tr></table>");

    expect(result.warnings).toEqual([{
      kind: "unverified-facility-noun",
      text: "西船橋駅",
      excerpt: "西船橋駅から近い",
    }]);
  });
});
