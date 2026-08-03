// @vitest-environment node
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { recheckReasonForFactReference, validateFactCoverage } from "./factCoverage";
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

  it("表セルの施設名はセル全文を抜粋にする", () => {
    const result = coverage("<table><tr><td>西船橋駅から近い</td></tr></table>");

    expect(result.warnings).toEqual([{
      kind: "unverified-facility-noun",
      text: "西船橋駅",
      excerpt: "西船橋駅から近い",
    }]);
  });
});

/*
 * 旧 factBinding.test.ts から移植した契約。
 * marker 機構(配置検査・usedFactIds 整合・表の列見出し照合)のテストは仕様廃止に伴い持ち込まないが、
 * 値照合・固有名詞判定の仕様はそのまま生きているのでここで担保する。
 * 捏造施設名の扱いだけ block → warnings(非ブロック)へ降格したため、期待値をその形に読み替えている。
 */
describe("validateFactCoverage: 施設系接尾辞の固有名詞判定(旧factBindingから移植)", () => {
  it.each([
    ["船橋市総合体育館の屋内コートで練習できます。", "船橋市総合体育館"],
    ["船橋ピックルボールクラブが毎週活動しています。", "船橋ピックルボールクラブ"],
    ["西船橋駅から徒歩圏内に専用コートがあります。", "西船橋駅"],
    ["千葉県ピックルボール協会が講師を派遣しています。", "千葉県ピックルボール協会"],
  ])("%s の施設名はfactに無ければ要確認として検出する", (sentence, noun) => {
    const result = coverage(`<p>${sentence}</p>`);

    expect(result.warnings.map((warning) => warning.text)).toEqual([noun]);
  });

  it.each([
    ["沿線の駅ごとに屋内コートを探す方法もあります。", "助詞分割で接尾辞だけが残る"],
    ["地域クラブへの参加が中心になります。", "一般修飾語+接尾辞"],
    ["地域で活動するクラブが受け皿になっています。", "活用を含む句+接尾辞"],
    ["近隣の体育館では個人開放を行っています。", "一般修飾語+接尾辞"],
    ["市内の体育館を順に調べる方法もあります。", "一般修飾語+接尾辞"],
    ["同クラブの活動日は施設ごとに違います。", "指示語+接尾辞"],
  ])("%s は一般論として書け、warningsにも載らない(%s)", (sentence) => {
    const result = coverage(`<p>${sentence}</p>`);

    expect(result.warnings).toEqual([]);
  });

  it("前置きが付いた実在固有名詞は前置きを除いて検出する", () => {
    const result = coverage(
      "<p>最寄りの本八幡駅から徒歩1分です。</p>",
      [fact("fact-access", "本八幡駅から徒歩1分")],
    );

    expect(result.warnings).toEqual([]);
    expect(result.references[0]).toMatchObject({ factId: "fact-access" });
  });

  it("factに含まれる一般名詞は既知固有名詞に登録しない", () => {
    // fact statement 側の「沿線の駅」から「駅」が既知語になると、本文全体で「駅」が使えなくなる。
    const result = coverage(
      "<p>沿線の駅を順に見ていく方法もあります。</p>",
      [fact("fact-area", "沿線の駅ごとに施設の有無が異なる")],
    );

    expect(result.warnings).toEqual([]);
    expect(result.references).toEqual([]);
  });
});

describe("validateFactCoverage: 値照合仕様(旧factBindingから移植)", () => {
  it("空本文とH2/H3の編集上の数字は値主張として扱わない", () => {
    expect(coverage("")).toEqual({
      cleanBodyHtml: "",
      references: [],
      warnings: [],
      binding: { version: FACT_BINDING_VERSION, bodyHash: bindingBodyHash("") },
    });
    expect(() => coverage("<h2>3つのポイント</h2><p>自分のペースで楽しめます。</p>")).not.toThrow();
  });

  it.each([
    ["金額", "<p>料金は500円です。</p>"],
    ["日付", "<p>開催日は2026年4月17日です。</p>"],
    ["ISO日付", "<p>開催日は2026-04-17です。</p>"],
    ["営業時間", "<p>営業時間は6:00-23:00です。</p>"],
    ["面数", "<p>コートは3面あります。</p>"],
    ["割合", "<p>利用者の25%が初心者です。</p>"],
    ["徒歩", "<p>駅から徒歩3分です。</p>"],
    ["無料", "<p>見学は無料です。</p>"],
    ["有料", "<p>レンタルは有料です。</p>"],
    ["統計", "<p>調査では平均が25%でした。</p>"],
    ["健康断定", "<p>継続すると血圧を下げます。</p>"],
  ])("factが無い%s主張をblockする", (_label, html) => {
    expect(() => coverage(html)).toThrow(/根拠のない値があります/);
  });

  it("全角カンマを正規化し、ISO日付と日本語日付を同一視する", () => {
    expect(() => coverage("<p>参加費は４，９８０円です。</p>", [fact("fact-price", "参加費 4,980円")])).not.toThrow();
    expect(() => coverage("<p>開催日は2026-04-17です。</p>", [fact("fact-date", "2026年4月17日に開催")])).not.toThrow();
    expect(() => coverage("<p>開催日は2026年4月17日です。</p>", [fact("fact-date", "2026-04-17に開催")])).not.toThrow();
    expect(() => coverage("<p>開催日は4月17日です。</p>", [fact("fact-date", "2026-04-17に開催")])).not.toThrow();
  });

  it.each([
    ["金額", "<p>料金は600円です。</p>", "料金は500円"],
    ["単位", "<p>コートは3本あります。</p>", "コートは3面"],
    ["日付", "<p>開催日は4月18日です。</p>", "開催日は4月17日"],
    ["営業時間", "<p>24時間営業です。</p>", "営業時間は6:00-23:00"],
    ["異種", "<p>料金は500円です。</p>", "駅から徒歩3分"],
  ])("%sのfact不一致をblockする", (_label, html, statement) => {
    expect(() => coverage(html, [fact("fact-x", statement)])).toThrow(/根拠のない値があります/);
  });

  it.each([
    ["万円", "<p>参加費は1万円です。</p>", "参加費は10,000円"],
    ["千円", "<p>参加費は2千円です。</p>", "参加費は2,000円"],
    ["分", "<p>所要時間は30分です。</p>", "所要時間は30分"],
    ["月", "<p>開始は4月です。</p>", "開始は4月"],
    ["倍", "<p>広さは2倍です。</p>", "広さは2倍"],
    ["順位", "<p>全国2位です。</p>", "全国2位"],
    ["桁区切り", "<p>参加者は2,000人です。</p>", "参加者は2,000人"],
  ])("%sを一体のatomとして照合する", (_label, html, statement) => {
    expect(() => coverage(html, [fact("fact-x", statement)])).not.toThrow();
  });

  it.each([
    ["年月", "<p>開始は2026年4月です。</p>", "開始は2026年5月"],
    ["桁区切り", "<p>参加者は2,000人です。</p>", "参加者は1,000人"],
    ["午前午後", "<p>開始は午前9時です。</p>", "開始は午後9時"],
  ])("%sの矛盾をblockする", (_label, html, statement) => {
    expect(() => coverage(html, [fact("fact-x", statement)])).toThrow(/根拠のない値があります/);
  });

  it("午前12時を0時として照合し、空の表セルは主張として扱わない", () => {
    expect(() => coverage(
      "<p>開始は午前12時です。</p><table><tr><th>備考</th></tr><tr><td></td></tr></table>",
      [fact("fact-midnight", "開始は0時")],
    )).not.toThrow();
  });

  it("No.1を統計主張として照合する", () => {
    expect(() => coverage("<p>調査でNo.1です。</p>", [fact("fact-rank", "調査でNo.1")])).not.toThrow();
  });

  it("ASCII除外語・小文字語は名称扱いせず、発行年・時刻・距離単位を照合する", () => {
    const facts = [fact("fact-detail", "AI pickle の発行年は2024年、9時30分、距離5km")];

    expect(() => coverage(
      "<p>発行年は2024年、9時30分、距離5kmです。</p><p>AI pickle は補助語です。</p>",
      facts,
    )).not.toThrow();
  });

  it("AIという語やhref・画像URLは値主張として走査しない", () => {
    const html = '<p>AIが作成した下書きです。<a href="https://example.com/2026/500yen">案内</a><img src="https://example.com/3.jpg"></p>';

    expect(coverage(html).cleanBodyHtml).toBe(html);
  });

  it("HTML entityを解釈して照合し、元のHTMLは書き換えない", () => {
    const html = "<p>料金は500円 &amp; 税込です。</p>";

    expect(coverage(html, [fact("fact-price", "料金は500円、税込")]).cleanBodyHtml).toBe(html);
  });

  it("th内の統計主張と健康主張をfactで裏付けて通す", () => {
    const facts: ResearchFact[] = [
      {
        id: "fact-stat",
        statement: "調査では平均25％",
        role: "detail",
        sourceType: "official-site",
        source: "https://example.com/stat",
        sourceLabel: undefined,
        isStatistic: true,
        isHealthClaim: undefined,
        publishedYear: 2024,
      },
      fact("fact-health", "運動で心肺機能が改善する"),
    ];

    const result = coverage(
      "<!--通常コメント--><h2>調査</h2><h3>結果</h3><table><tr><th>調査では平均25％</th></tr></table><p>心肺機能が改善する！</p>",
      facts,
    );

    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toMatchObject({ container: "th", sectionPath: "調査 > 結果" });
  });

  it("同じfactを複数コンテナで参照すると見出し経路付きで各行を作る", () => {
    const result = coverage(
      "<h2>概要</h2><p>料金は500円です。</p><h3>詳細</h3><ul><li>参加費も500円です。</li></ul>",
      [fact("fact-price", "料金・参加費は500円")],
    );

    expect(result.references.map(({ sectionPath, container, containerIndex }) => [sectionPath, container, containerIndex]))
      .toEqual([["概要", "p", 1], ["概要 > 詳細", "li", 1]]);
  });
});

describe("recheckReasonForFactReference", () => {
  it("可変情報とdoNotWrite由来トピックを公開前再確認にする", () => {
    expect(recheckReasonForFactReference("参加費は500円", "参加費は500円", [])).toBe("料金");
    expect(recheckReasonForFactReference("営業時間は6:00-23:00", "営業時間は6:00-23:00", [])).toBe("営業時間");
    expect(recheckReasonForFactReference("ラウンジを設置", "ラウンジがあります", ["ラウンジの利用可否は未確定"])).toBe("利用可否");
    expect(recheckReasonForFactReference("予約サービス名はPBT", "予約サービス名はPBT", [])).toBe("予約サービス名");
    expect(recheckReasonForFactReference("代表は山田氏", "代表は山田氏", [])).toBe("現在の肩書き");
    expect(recheckReasonForFactReference("定員は20人", "定員は20人", [])).toBe("定員");
    expect(recheckReasonForFactReference("体験会を開催", "体験会を開催", [])).toBe("イベント日時");
    const canonical = [
      "期限付きキャンペーン、割引率、クーポンコード、キャンペーン価格は確認せずに書かない",
      "予約先の外部サービス名やRESERVAからLaBOLAへの移行期間は可変情報",
      "イベント、体験会の開催日時・参加料金・定員・出演者は書かない",
      "ラウンジスペースは利用可能と断定しない",
      "24時間営業は現在の営業時間として書かない",
      "国内最大など比較根拠のない優位表現を使わない",
      "未公表の会員制度、月額料金、貸切料金、法人利用料金を書かない",
      "スタッフや選手の肩書き・実績は範囲を超えて書かない",
    ];
    const examples = [
      ["キャンペーン価格を実施", "料金"],
      ["現在はRESERVAを利用しています", "予約サービス名"],
      ["出演者は山田氏", "イベント日時"],
      ["ラウンジスペースを利用できます", "利用可否"],
      ["24時間営業です", "営業時間"],
      ["国内最大規模です", "比較優位"],
      ["法人利用料金は1万円", "料金"],
      ["現在の肩書きはコーチ", "現在の肩書き"],
    ] as const;
    examples.forEach(([excerpt, reason]) => {
      expect(recheckReasonForFactReference(excerpt, excerpt, canonical)).toBe(reason);
    });
  });

  it("歴史的日付は再確認対象にしない", () => {
    expect(recheckReasonForFactReference("協会は2024年に設立", "協会は2024年に設立", [])).toBeUndefined();
    expect(recheckReasonForFactReference("ラウンジを設置", "ラウンジがあります", ["料金は未確定"])).toBeUndefined();
  });
});
