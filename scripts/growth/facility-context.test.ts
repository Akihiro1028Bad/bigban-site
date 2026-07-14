// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  resolveFacilityPhase,
  renderFacilityContext,
  parseFacilityContextData,
  type FacilityContextData,
} from "./facility-context";
import facilityContextJson from "./facility-context.json";

const SAMPLE: FacilityContextData = {
  name: "THE PICKLE BANG THEORY",
  openDate: "2026-04-18",
  location: ["千葉県市川市・本八幡駅 徒歩1分", "都営新宿線の始発駅"],
  confirmed: ["インドア(屋内)コートのピックルボール施設"],
  doNotWrite: ["営業時間・定休日", "料金・キャンペーン", "コート面数"],
  notes: "開業日は確定。可変情報は doNotWrite を厳守。",
};

describe("facility-context.json", () => {
  it("現在の営業情報・料金・アクセス・HYROX情報を正典として保持する", () => {
    const context = parseFacilityContextData(facilityContextJson);

    expect(context.openDate).toBe("2026-04-17");
    expect(context.location).toEqual(expect.arrayContaining([
      expect.stringContaining("八幡ハタビル6階"),
      expect.stringContaining("都営新宿線"),
      expect.stringContaining("京成本線"),
    ]));
    expect(context.confirmed).toEqual(expect.arrayContaining([
      expect.stringContaining("4,980円"),
      expect.stringContaining("HYROX公式8種目"),
      expect.stringContaining("関吉大亮"),
      expect.stringContaining("小さなディンクから、大きなムーブメントへ。"),
    ]));
    expect(context.confirmed.join("\n")).not.toContain("第三の居場所");
    expect(context.doNotWrite).toEqual(expect.arrayContaining([
      expect.stringContaining("期限付きキャンペーン"),
      expect.stringContaining("24時間営業"),
      expect.stringContaining("国内最大"),
    ]));
  });
});

describe("resolveFacilityPhase", () => {
  it("基準日が開業日より前なら pre-open と残り日数を返す", () => {
    const result = resolveFacilityPhase("2026-04-18", new Date("2026-03-19T07:00:00+09:00"));
    expect(result.phase).toBe("pre-open");
    expect(result.days).toBe(30);
  });

  it("開業日当日は open(経過0日)とする", () => {
    const result = resolveFacilityPhase("2026-04-18", new Date("2026-04-18T07:00:00+09:00"));
    expect(result.phase).toBe("open");
    expect(result.days).toBe(0);
  });

  it("基準日が開業日より後なら open と経過日数を返す", () => {
    // 2026-04-18 → 2026-06-18 は 61 日後
    const result = resolveFacilityPhase("2026-04-18", new Date("2026-06-18T07:00:00+09:00"));
    expect(result.phase).toBe("open");
    expect(result.days).toBe(61);
  });

  it("JST基準で日付境界を判定する(UTCでは前日でもJSTで当日なら当日扱い)", () => {
    // UTC では 2026-04-17T23:30Z だが JST では 2026-04-18 08:30 → 当日(open)
    const result = resolveFacilityPhase("2026-04-18", new Date("2026-04-17T23:30:00Z"));
    expect(result.phase).toBe("open");
    expect(result.days).toBe(0);
  });
});

describe("parseFacilityContextData", () => {
  it("正しい形のデータをそのまま返す", () => {
    expect(parseFacilityContextData(SAMPLE)).toEqual(SAMPLE);
  });

  it("openDate が YYYY-MM-DD でなければ例外を投げる", () => {
    expect(() => parseFacilityContextData({ ...SAMPLE, openDate: "2026/04/18" })).toThrow();
  });

  it("必須フィールド(name)が欠けていれば例外を投げる", () => {
    const rest: Omit<FacilityContextData, "name"> = {
      openDate: SAMPLE.openDate,
      location: SAMPLE.location,
      confirmed: SAMPLE.confirmed,
      doNotWrite: SAMPLE.doNotWrite,
      notes: SAMPLE.notes,
    };
    expect(() => parseFacilityContextData(rest)).toThrow();
  });

  it("location が配列でなければ例外を投げる", () => {
    expect(() => parseFacilityContextData({ ...SAMPLE, location: "本八幡" })).toThrow();
  });
});

describe("renderFacilityContext", () => {
  it("開業済みのとき『開業済み』と経過日数を明記し、待ち表現を促さない", () => {
    const md = renderFacilityContext(SAMPLE, new Date("2026-06-18T07:00:00+09:00"));
    expect(md).toContain("2026-06-18");
    expect(md).toContain("開業済み");
    expect(md).toContain("開業から61日");
    expect(md).toContain("2026-04-18");
    // doNotWrite 項目と最新情報確認の方針
    expect(md).toContain("料金・キャンペーン");
    expect(md).toContain("最新情報をご確認ください");
    // 単一ソースの明記
    expect(md).toContain("facility-context.json");
  });

  it("開業前のとき『開業前』と残り日数を明記する", () => {
    const md = renderFacilityContext(SAMPLE, new Date("2026-03-19T07:00:00+09:00"));
    expect(md).toContain("開業前");
    expect(md).toContain("開業まで30日");
  });

  it("確定事実・立地を箇条書きで含める", () => {
    const md = renderFacilityContext(SAMPLE, new Date("2026-06-18T07:00:00+09:00"));
    expect(md).toContain("本八幡駅 徒歩1分");
    expect(md).toContain("インドア(屋内)コート");
  });

  it("notes が未設定でも描画できる", () => {
    const noNotes: FacilityContextData = {
      name: SAMPLE.name,
      openDate: SAMPLE.openDate,
      location: SAMPLE.location,
      confirmed: SAMPLE.confirmed,
      doNotWrite: SAMPLE.doNotWrite,
    };
    const md = renderFacilityContext(noNotes, new Date("2026-06-18T07:00:00+09:00"));
    expect(md).toContain("開業済み");
    expect(md).not.toContain("undefined");
  });
});
