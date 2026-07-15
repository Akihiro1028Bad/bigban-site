// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildSourceLedgerFromUsedFacts,
  duplicateExternalLinks,
  externalLinksOutsideFacts,
  parseResearchPacket,
  validateResearchPacketSources,
  parseWriterOutput,
  RESEARCH_OUTPUT_JSON_SCHEMA,
} from "./draftPipeline";

const research = {
  version: 1,
  facts: [
    {
      id: "fact-option",
      statement: "市川ピックルボールクラブは市内で活動している",
      role: "option",
      sourceType: "official-site",
      source: "https://pickleball-chiba.com/lp/ichikawa/",
      sourceLabel: "市川ピックルボールクラブ",
    },
    {
      id: "fact-constraint",
      statement: "市民体育館の個人開放種目にピックルボールは含まれない",
      role: "constraint",
      sourceType: "official-site",
      source: "https://www.city.ichikawa.lg.jp/page/3910.html",
      sourceLabel: "市川市 個人開放日",
    },
  ],
};

describe("draftPipeline structured contracts", () => {
  it("構造化出力Schemaは全プロパティを必須化し、任意値をnullで表現する", () => {
    const itemSchema = RESEARCH_OUTPUT_JSON_SCHEMA.properties.facts.items;
    expect(itemSchema.required).toEqual(Object.keys(itemSchema.properties));
    expect(itemSchema.properties.sourceLabel.type).toEqual(["string", "null"]);
    expect(itemSchema.properties.publishedYear.type).toEqual(["integer", "null"]);
    expect(RESEARCH_OUTPUT_JSON_SCHEMA.properties.version).toEqual({
      type: "integer",
      enum: [1],
    });
  });

  it("ResearchPacketを検証する", () => {
    expect(parseResearchPacket(research)).toEqual(research);
    expect(() => parseResearchPacket({ ...research, facts: [research.facts[0], research.facts[0]] })).toThrow(/fact id/i);
    expect(() =>
      parseResearchPacket({
        version: 1,
        facts: [{ ...research.facts[0], source: "検索結果" }],
      }),
    ).toThrow(/URL/);
  });

  it("facility-contextと一次情報メモ由来のfactを元入力と照合する", () => {
    const trusted = {
      facilityConfirmed: ["屋内にDecoTurfコートが3面ある"],
      facilityLocation: ["JR総武線「本八幡駅」北口から徒歩1分"],
      primaryNotes: "利用者への貸出パドルは受付で案内する。シューズの貸出はない。",
    };
    const packet = parseResearchPacket({
      version: 1,
      facts: [
        {
          ...research.facts[0],
          id: "fact-facility",
          statement: "屋内にDecoTurfコートが3面ある",
          sourceType: "facility-context",
          source: "facility-context.json",
        },
        {
          ...research.facts[0],
          id: "fact-location",
          statement: "JR総武線「本八幡駅」北口から徒歩1分",
          sourceType: "facility-context",
          source: "facility-context.json",
        },
        {
          ...research.facts[0],
          id: "fact-primary",
          statement: "シューズの貸出はない",
          sourceType: "primary-note",
          source: "一次情報メモ",
        },
      ],
    });
    expect(validateResearchPacketSources(packet, trusted)).toEqual(packet);
    expect(() => validateResearchPacketSources(parseResearchPacket({
      version: 1,
      facts: [{
        ...research.facts[0],
        sourceType: "facility-context",
        source: "facility-context.json",
        statement: "24時間営業している",
      }],
    }), trusted)).toThrow(/facility-context/);
    expect(() => validateResearchPacketSources(parseResearchPacket({
      version: 1,
      facts: [{
        ...research.facts[0],
        sourceType: "primary-note",
        source: "一次情報メモ",
        statement: "パドルを無料で借りられる",
      }],
    }), trusted)).toThrow(/一次情報メモ/);
  });

  it("一次情報メモから否定や条件を削った部分一致factを拒否する", () => {
    const packet = parseResearchPacket({
      version: 1,
      facts: [{
        ...research.facts[0],
        id: "fact-inverted-note",
        statement: "キャンペーンは実施",
        sourceType: "primary-note",
        source: "一次情報メモ",
      }],
    });

    expect(() => validateResearchPacketSources(packet, {
      facilityConfirmed: [],
      facilityLocation: [],
      primaryNotes: "キャンペーンは実施しない。",
    })).toThrow(/一次情報メモ/);
  });

  it("一次情報メモの句点と箇条書き記号だけの差は許容する", () => {
    const trusted = {
      facilityConfirmed: [],
      facilityLocation: [],
      primaryNotes: "- シューズの貸出はない。\n・パドルは受付で案内する！",
    };
    const packet = parseResearchPacket({
      version: 1,
      facts: [
        {
          ...research.facts[0],
          id: "fact-shoes",
          statement: "シューズの貸出はない。",
          sourceType: "primary-note",
          source: "一次情報メモ",
        },
        {
          ...research.facts[0],
          id: "fact-paddle",
          statement: "パドルは受付で案内する",
          sourceType: "primary-note",
          source: "一次情報メモ",
        },
      ],
    });

    expect(validateResearchPacketSources(packet, trusted)).toEqual(packet);
  });

  it("正典由来factには正典のsource名を必須にする", () => {
    const packet = parseResearchPacket({
      version: 1,
      facts: [{
        ...research.facts[0],
        sourceType: "facility-context",
        source: "任意のメモ",
        statement: "屋内3面",
      }],
    });
    expect(() => validateResearchPacketSources(packet, {
      facilityConfirmed: ["屋内3面"],
      facilityLocation: [],
      primaryNotes: "",
    })).toThrow(/source/);
  });

  it("統計の事実にはpublishedYearを必須にする", () => {
    expect(() =>
      parseResearchPacket({
        version: 1,
        facts: [{ ...research.facts[0], statement: "利用者の25％が初心者", role: "detail", isStatistic: true }],
      }),
    ).toThrow(/publishedYear/);
    expect(() => parseResearchPacket({
      version: 1,
      facts: [{
        ...research.facts[0],
        statement: "利用者の25％が初心者",
        role: "detail",
        isStatistic: true,
        publishedYear: 2026,
      }],
    })).not.toThrow();
  });

  it("統計・健康情報は公式サイト確認済みのfactだけを許可する", () => {
    expect(() => parseResearchPacket({
      version: 1,
      facts: [{
        ...research.facts[0],
        sourceType: "primary-note",
        source: "一次情報メモ",
        statement: "利用者の25％が初心者",
        isStatistic: true,
        publishedYear: 2026,
      }],
    })).toThrow(/official-site/);
    expect(() => parseResearchPacket({
      version: 1,
      facts: [{
        ...research.facts[0],
        sourceType: "facility-context",
        source: "facility-context.json",
        statement: "運動は健康維持に役立つ",
        isHealthClaim: true,
        publishedYear: 2026,
      }],
    })).toThrow(/official-site/);
  });

  it("公式情報源には表示名を必須にし、健康情報にもpublishedYearを必須にする", () => {
    expect(() => parseResearchPacket({
      version: 1,
      facts: [{ ...research.facts[0], sourceLabel: undefined }],
    })).toThrow(/sourceLabel/);
    expect(() => parseResearchPacket({
      version: 1,
      facts: [{ ...research.facts[0], isHealthClaim: true }],
    })).toThrow(/publishedYear/);
    expect(parseResearchPacket({
      version: 1,
      facts: [{ ...research.facts[0], isHealthClaim: true, publishedYear: 2025 }],
    }).facts[0]).toMatchObject({
      sourceLabel: "市川ピックルボールクラブ",
      isHealthClaim: true,
      publishedYear: 2025,
    });
  });

  it("料金条件など統計ではない割合にはpublishedYearを要求しない", () => {
    expect(
      parseResearchPacket({
        version: 1,
        facts: [{ ...research.facts[0], statement: "キャンセル料は利用料の50％", role: "detail" }],
      }).facts[0],
    ).not.toHaveProperty("publishedYear");
  });

  it("WriterOutputを検証し未確認fact idを拒否する", () => {
    const writer = {
      slug: "pickleball-ichikawa",
      excerpt: "市川市でプレーできる場所を比較します。",
      bodyHtml: "<h2>場所</h2><p>本文</p>",
      usedFactIds: ["fact-option"],
    };
    expect(parseWriterOutput(writer, parseResearchPacket(research))).toEqual(writer);
    expect(() => parseWriterOutput({ ...writer, usedFactIds: ["missing"] }, parseResearchPacket(research))).toThrow(/missing/);
  });

  it("使用したfact idだけから既存sourceLedger形式を生成する", () => {
    expect(buildSourceLedgerFromUsedFacts(parseResearchPacket(research), ["fact-option"])).toEqual([
      {
        sourceType: "official-site",
        source: "https://pickleball-chiba.com/lp/ichikawa/",
        confirmedFacts: ["市川ピックルボールクラブは市内で活動している"],
      },
    ]);
  });

  it("同じ出典の使用factを重複なしでまとめ、未使用factを除外する", () => {
    const packet = parseResearchPacket({
      version: 1,
      facts: [
        research.facts[0],
        { ...research.facts[0], id: "fact-option-2", statement: "週末に活動している" },
        { ...research.facts[0], id: "fact-option-3" },
        research.facts[1],
      ],
    });
    expect(buildSourceLedgerFromUsedFacts(packet, ["fact-option", "fact-option-2", "fact-option-3"])).toEqual([{
      sourceType: "official-site",
      source: "https://pickleball-chiba.com/lp/ichikawa/",
      confirmedFacts: ["市川ピックルボールクラブは市内で活動している", "週末に活動している"],
    }]);
  });

  it("確認済み公式URLと固定CTA以外の外部リンクを検出する", () => {
    const html = [
      '<a href="https://pickleball-chiba.com/lp/ichikawa/">公式</a>',
      '<a href="https://www.thepicklebang.com/reserve">予約</a>',
      '<a href="https://example.com/matome">まとめ</a>',
    ].join("");
    expect(externalLinksOutsideFacts(html, parseResearchPacket(research), ["fact-option"])).toEqual([
      "https://example.com/matome",
    ]);
  });

  it("同じ外部URLの重複リンクを検出する", () => {
    const html = [
      '<a href="https://example.jp/official">初出</a>',
      '<a href="https://example.jp/official">再掲</a>',
      '<a href="/column/internal">内部</a>',
    ].join("");

    expect(duplicateExternalLinks(html)).toEqual(["https://example.jp/official"]);
    expect(duplicateExternalLinks('<a href="/internal">内部</a>')).toEqual([]);
  });

  it("空白付き・引用符なし・大文字属性の外部hrefも検出する", () => {
    const html = [
      '<a href = "https://example.jp/spaced">空白</a>',
      "<a href=https://example.jp/unquoted>引用符なし</a>",
      '<A HREF="https://example.jp/upper">大文字</A>',
      '<a href="//example.jp/protocol-relative">相対プロトコル</a>',
      '<a href="mailto:info@example.jp">メール</a>',
      '<a href="tel:0471234567">電話</a>',
    ].join("");
    expect(externalLinksOutsideFacts(html, parseResearchPacket(research), [])).toEqual([
      "https://example.jp/spaced",
      "https://example.jp/unquoted",
      "https://example.jp/upper",
      "//example.jp/protocol-relative",
      "mailto:info@example.jp",
      "tel:0471234567",
    ]);
  });

  it("HTTPS以外の公式URLを拒否し、一次情報メモはURL不要で受理する", () => {
    expect(() => parseResearchPacket({
      version: 1,
      facts: [{ ...research.facts[0], source: "http://example.jp" }],
    })).toThrow(/HTTPS/);
    expect(() => parseResearchPacket({
      version: 1,
      facts: [{ ...research.facts[0], sourceType: "primary-note", source: "社内確認メモ" }],
    })).not.toThrow();
  });
});
