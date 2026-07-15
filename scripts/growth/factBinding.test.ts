// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  recheckReasonForFactReference,
  validateAndStripFactBindings,
} from "./factBinding";
import { FACT_BINDING_VERSION, bindingBodyHash } from "./factBindingMetadata";
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

function validate(bodyHtml: string, facts: ResearchFact[], usedFactIds = facts.map(({ id }) => id)) {
  return validateAndStripFactBindings({ bodyHtml, facts, usedFactIds });
}

describe("validateAndStripFactBindings", () => {
  it("直前の1文を見出し経路と位置付きで束縛し、markerだけを除去する", () => {
    const bodyHtml = "<h2>料金 &amp; 利用</h2><p>説明です。参加費は4,980円<!--FACT:fact-price-->。</p>{{IMG:1}}";
    expect(validate(bodyHtml, [fact("fact-price", "参加費は4980 円")])).toEqual({
      cleanBodyHtml: "<h2>料金 &amp; 利用</h2><p>説明です。参加費は4,980円。</p>{{IMG:1}}",
      usedFactIds: ["fact-price"],
      binding: { version: FACT_BINDING_VERSION, bodyHash: bindingBodyHash("<h2>料金 &amp; 利用</h2><p>説明です。参加費は4,980円。</p>{{IMG:1}}") },
      references: [{
        factId: "fact-price",
        excerpt: "参加費は4,980円",
        sectionPath: "料金 & 利用",
        container: "p",
        containerIndex: 1,
        claimKinds: ["price"],
      }],
    });
  });

  it("H2/H3の編集上の数字・一般定性文・空本文はbinding不要", () => {
    expect(validate("", [], [])).toEqual({
      cleanBodyHtml: "",
      usedFactIds: [],
      references: [],
      binding: { version: FACT_BINDING_VERSION, bodyHash: bindingBodyHash("") },
    });
    expect(validate("<h2>3つのポイント</h2><p>自分のペースで楽しめます。</p>", [], [])).toEqual({
      cleanBodyHtml: "<h2>3つのポイント</h2><p>自分のペースで楽しめます。</p>",
      usedFactIds: [],
      references: [],
      binding: { version: FACT_BINDING_VERSION, bodyHash: bindingBodyHash("<h2>3つのポイント</h2><p>自分のペースで楽しめます。</p>") },
    });
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
  ])("markerなしの%s主張をblockする", (_label, html) => {
    expect(() => validate(html, [], [])).toThrow(/fact marker/);
  });

  it("日付・全角カンマを正規化し、ISO日付と日本語日付を同一視する", () => {
    expect(() => validate("<p>参加費は４，９８０円<!--FACT:fact-price-->。</p>", [fact("fact-price", "参加費 4,980円")])).not.toThrow();
    expect(() => validate("<p>開催日は2026-04-17<!--FACT:fact-date-->。</p>", [fact("fact-date", "2026年4月17日に開催")])).not.toThrow();
    expect(() => validate("<p>開催日は2026年4月17日<!--FACT:fact-date-->。</p>", [fact("fact-date", "2026-04-17に開催")])).not.toThrow();
    expect(() => validate("<p>開催日は4月17日<!--FACT:fact-date-->。</p>", [fact("fact-date", "2026-04-17に開催")])).not.toThrow();
  });

  it.each([
    ["金額", "<p>料金は600円<!--FACT:fact-x-->。</p>", "料金は500円"],
    ["単位", "<p>コートは3本<!--FACT:fact-x-->。</p>", "コートは3面"],
    ["日付", "<p>開催日は4月18日<!--FACT:fact-x-->。</p>", "開催日は4月17日"],
    ["営業時間", "<p>24時間営業<!--FACT:fact-x-->。</p>", "営業時間は6:00-23:00"],
    ["異種", "<p>料金は500円<!--FACT:fact-x-->。</p>", "駅から徒歩3分"],
  ])("%sのfact不一致をblockする", (_label, html, statement) => {
    expect(() => validate(html, [fact("fact-x", statement)])).toThrow(/一致|支えて/);
  });

  it("複数factが全atomを分担して支える", () => {
    const result = validate(
      "<p>参加費は500円、定員は20人<!--FACT:fact-price,fact-capacity-->。</p>",
      [fact("fact-price", "参加費は500円"), fact("fact-capacity", "定員は20人")],
    );
    expect(result.references).toHaveLength(2);
    expect(() => validate(
      "<p>参加費は500円<!--FACT:fact-price,fact-walk-->。</p>",
      [fact("fact-price", "参加費は500円"), fact("fact-walk", "駅から徒歩3分")],
    )).toThrow(/支えて/);
  });

  it("未知ID・usedFactIds不一致・usedFactIds重複をblockする", () => {
    const html = "<p>料金は500円<!--FACT:fact-price-->。</p>";
    expect(() => validate(html, [], ["fact-price"])).toThrow(/未知/);
    expect(() => validate(html, [fact("fact-price", "料金は500円")], [])).toThrow(/一致/);
    expect(() => validate(html, [fact("fact-price", "料金は500円")], ["fact-price", "fact-price"])).toThrow(/重複/);
    expect(() => validate(
      "<p>料金は500円<!--FACT:fact-price,fact-price-->。</p>",
      [fact("fact-price", "料金は500円")],
      ["fact-price"],
    )).toThrow(/重複/);
  });

  it("同じfactの複数箇所参照を許可する", () => {
    const result = validate(
      "<h2>概要</h2><p>料金は500円<!--FACT:fact-price-->。</p><h3>詳細</h3><li>参加費も500円<!--FACT:fact-price-->。</li>",
      [fact("fact-price", "料金・参加費は500円")],
    );
    expect(result.references.map(({ sectionPath, containerIndex }) => [sectionPath, containerIndex])).toEqual([
      ["概要", 1], ["概要 > 詳細", 1],
    ]);
  });

  it("表セル終端のbindingを許可し、別セルのmarker流用を拒否する", () => {
    expect(validate(
      "<h2>比較</h2><table><tr><th>料金</th><td>500円<!--FACT:fact-price--></td></tr></table>",
      [fact("fact-price", "料金は500円")],
    ).references[0]).toMatchObject({ container: "td", excerpt: "500円" });
    expect(() => validate(
      "<table><tr><td>500円</td><td>説明<!--FACT:fact-price--></td></tr></table>",
      [fact("fact-price", "料金は500円")],
    )).toThrow(/fact marker|支えて/);
    expect(() => validate(
      "<table><tr><th>500円<!--FACT:fact-price-->の料金</th></tr></table>",
      [fact("fact-price", "料金は500円")],
    )).toThrow(/セル終端/);
    expect(() => validate(
      "<table><tr><th>施設</th><th>料金</th></tr><tr><td>A</td><td>500<!--FACT:fact-price--></td></tr></table>",
      [fact("fact-price", "料金は500円")],
    )).not.toThrow();
    expect(() => validate(
      "<table><tr><th>施設</th><th>料金</th></tr><tr><td>A</td><td>500</td></tr></table>",
      [],
      [],
    )).toThrow(/fact marker/);
  });

  it.each([
    ["タグ外", "<p>料金は500円。</p><!--FACT:fact-price-->"],
    ["見出し", "<h2>料金500円<!--FACT:fact-price--></h2>"],
    ["空主張", "<p><!--FACT:fact-price-->。</p>"],
    ["句点後", "<p>料金は500円。<!--FACT:fact-price--></p>"],
    ["不正ID", "<p>料金は500円<!--FACT:price-->。</p>"],
    ["不完全", "<p>料金は500円<!--FACT:fact-price</p>"],
    ["先頭空白", "<p>料金は500円<!-- FACT:fact-price-->。</p>"],
    ["句点前でない", "<p>料金は500円<!--FACT:fact-price-->です。</p>"],
  ])("marker位置・形式が不正ならblockする: %s", (_label, html) => {
    expect(() => validate(html, [fact("fact-price", "料金は500円")])).toThrow(/marker|形式|位置/);
  });

  it("sourceLabel・既知ASCIIブランド・日本語施設名をbinding対象にする", () => {
    expect(() => validate("<p>日本ピックルボール協会<!--FACT:fact-org-->。</p>", [fact("fact-org", "競技団体", "日本ピックルボール協会")])).not.toThrow();
    expect(() => validate("<p>HYROX<!--FACT:fact-brand-->。</p>", [fact("fact-brand", "HYROX向け設備")])).not.toThrow();
    expect(() => validate("<p>市川体育館を利用できます。</p>", [], [])).toThrow(/fact marker/);
    expect(() => validate("<p>別の体育館<!--FACT:fact-brand-->。</p>", [fact("fact-brand", "HYROX向け設備")])).toThrow(/支えて|一致/);
    expect(() => validate("<p>XHYROXQ<!--FACT:fact-brand-->。</p>", [fact("fact-brand", "HYROX向け設備")])).toThrow(/判定できません|一致/);
    expect(() => validate("<p>説明<!--FACT:fact-brand-->。</p>", [fact("fact-brand", "HYROX向け設備")])).toThrow(/判定できません/);
  });

  it("AIという語やhref・画像URLは走査しない", () => {
    const html = '<p>AIが作成した下書きです。<a href="https://example.com/2026/500yen">案内</a><img src="https://example.com/3.jpg"></p>';
    expect(validate(html, [], []).cleanBodyHtml).toBe(html);
  });

  it("HTML entityを安全に扱い、元HTMLはmarker以外変更しない", () => {
    const html = "<p>料金は500円 &amp; 税込<!--FACT:fact-price-->。</p>";
    expect(validate(html, [fact("fact-price", "料金は500円、税込")]).cleanBodyHtml).toBe("<p>料金は500円 &amp; 税込。</p>");
  });

  it("th・h3・通常comment・sourceLabelなしfactを構造解析し、統計と健康主張も照合する", () => {
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
    const result = validate(
      "<!--通常コメント--><h2>調査</h2><h3>結果</h3><table><tr><th>調査では平均25％<!--FACT:fact-stat--></th></tr></table><p>心肺機能が改善する<!--FACT:fact-health-->！</p>",
      facts,
    );
    expect(result.references).toHaveLength(2);
    expect(result.references[0]).toMatchObject({ container: "th", sectionPath: "調査 > 結果" });
  });

  it("ASCII除外語・小文字語は固有名詞扱いせず、発行年・時刻・距離単位を照合する", () => {
    const facts = [fact("fact-detail", "AI pickle の発行年は2024年、9時30分、距離5km")];
    expect(() => validate(
      "<p>発行年は2024年、9時30分、距離5km<!--FACT:fact-detail-->。</p><p>AI pickle は補助語です。</p>",
      facts,
    )).not.toThrow();
  });

  it("No.1を統計主張として照合する", () => {
    expect(() => validate("<p>調査でNo.1<!--FACT:fact-rank-->。</p>", [fact("fact-rank", "調査でNo.1")])).not.toThrow();
  });

  it("container外の可視テキストをrejectし、画像markerと空白は許可する", () => {
    expect(() => validate("<h2>料金</h2><strong>参加費は500円です。</strong>", [], [])).toThrow(/container外/);
    expect(() => validate("<h2>画像</h2>\n{{IMG:1}}\n<p>説明です。</p>", [], [])).not.toThrow();
  });

  it.each([
    ["万円", "<p>参加費は1万円<!--FACT:fact-x-->。</p>", "参加費は10,000円"],
    ["千円", "<p>参加費は2千円<!--FACT:fact-x-->。</p>", "参加費は2,000円"],
    ["分", "<p>所要時間は30分<!--FACT:fact-x-->。</p>", "所要時間は30分"],
    ["月", "<p>開始は4月<!--FACT:fact-x-->。</p>", "開始は4月"],
    ["倍", "<p>広さは2倍<!--FACT:fact-x-->。</p>", "広さは2倍"],
    ["順位", "<p>全国2位<!--FACT:fact-x-->。</p>", "全国2位"],
    ["桁区切り", "<p>参加者は2,000人<!--FACT:fact-x-->。</p>", "参加者は2,000人"],
  ])("%sを一体のatomとして照合する", (_label, html, statement) => {
    expect(() => validate(html, [fact("fact-x", statement)])).not.toThrow();
  });

  it("午前12時を0時として照合し、空表セルは主張として扱わない", () => {
    expect(() => validate(
      "<p>開始は午前12時<!--FACT:fact-midnight-->。</p><table><tr><th>備考</th></tr><tr><td></td></tr></table>",
      [fact("fact-midnight", "開始は0時")],
    )).not.toThrow();
  });

  it.each([
    ["年月", "<p>開始は2026年4月<!--FACT:fact-x-->。</p>", "開始は2026年5月"],
    ["桁区切り", "<p>参加者は2,000人<!--FACT:fact-x-->。</p>", "参加者は1,000人"],
    ["午前午後", "<p>開始は午前9時<!--FACT:fact-x-->。</p>", "開始は午後9時"],
  ])("%sの矛盾をrejectする", (_label, html, statement) => {
    expect(() => validate(html, [fact("fact-x", statement)])).toThrow(/一致/);
  });

  it("定性的な比較表セルをヘッダーと組み合わせてbindingする", () => {
    const facts = [
      fact("fact-name", "施設A"),
      fact("fact-indoor", "施設Aは屋内コートあり"),
      fact("fact-reserve", "施設Aは予約可能"),
    ];
    expect(() => validate(
      "<table><tr><th>施設</th><th>屋内コート</th><th>予約</th></tr><tr><td>施設A<!--FACT:fact-name--></td><td>あり<!--FACT:fact-indoor--></td><td>可能<!--FACT:fact-reserve--></td></tr></table>",
      facts,
    )).not.toThrow();
    expect(() => validate(
      "<table><tr><th>施設</th><th>予約</th></tr><tr><td>施設A<!--FACT:fact-name--></td><td>可能</td></tr></table>",
      [facts[0]],
    )).toThrow(/fact marker/);
  });

  it("publishedYearを統計factのsupport keyに含める", () => {
    const statistic = { ...fact("fact-stat", "競技人口を公表", "SFIA"), isStatistic: true, publishedYear: 2024 };
    expect(() => validate("<p>SFIA（2024年）<!--FACT:fact-stat-->。</p>", [statistic])).not.toThrow();
    expect(() => validate("<h2>参考資料</h2><p>SFIA（2024年）<!--FACT:fact-stat-->。</p>", [statistic])).not.toThrow();
  });

  it("fact由来の既知名称だけを最長一致し、前置修飾語を取り込まない", () => {
    expect(() => validate(
      "<p>最寄りの本八幡駅から徒歩1分<!--FACT:fact-access-->。</p>",
      [fact("fact-access", "本八幡駅から徒歩1分")],
    )).not.toThrow();
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
