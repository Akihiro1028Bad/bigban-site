import { describe, expect, it } from "vitest";
import { ageBand, extractWard, occupationGroup, pseudoId } from "./piiBoundary";

describe("pseudoId", () => {
  it("メールを小文字化してHMACの16hexを返す", () => { const value = pseudoId("Taro@Example.com", "", "key1"); expect(value).toBe(pseudoId("taro@example.com", "", "key1")); expect(value).toMatch(/^[0-9a-f]{16}$/); expect(value).not.toBe(pseudoId("taro@example.com", "", "key2")); });
  it("メールが無ければ会員番号で代替、両方無しはnull", () => { expect(pseudoId("", "00901", "k")).toMatch(/^[0-9a-f]{16}$/); expect(pseudoId("", "", "k")).toBeNull(); });
});
describe("extractWard", () => {
  it("都道府県+市区町村を市区町村名にする", () => { expect(extractWard("東京都台東区根岸5-1-9-205")).toBe("台東区"); expect(extractWard("千葉県市川市南八幡4-15-13")).toBe("市川市"); expect(extractWard("神奈川県横浜市鶴見区江ケ崎1-2")).toBe("横浜市鶴見区"); expect(extractWard("山口県防府市新田626-7")).toBe("防府市"); });
  it("都道府県が無い住所でも区・市を拾う", () => expect(extractWard("荒川区町屋4-5-12")).toBe("荒川区"));
  it("抽出不能・空は不明", () => { expect(extractWard("")).toBe("不明"); expect(extractWard("港")).toBe("不明"); });
});
describe("ageBand", () => { it("基準日時点の年代を返す", () => { expect(ageBand("1990/01/02", "2026-07-16")).toBe("30代"); expect(ageBand("2005-06-10 00:00:00", "2026-07-16")).toBe("20代"); expect(ageBand("2006/07/16", "2026-07-16")).toBe("20代"); expect(ageBand("2006/07/17", "2026-07-16")).toBe("10代以下"); expect(ageBand("2006/08/01", "2026-07-16")).toBe("10代以下"); expect(ageBand("1958/01/01", "2026-07-16")).toBe("60代以上"); expect(ageBand("2010/01/01", "2026-07-16")).toBe("10代以下"); }); it("空・不正・未来日は不明", () => { expect(ageBand("", "2026-07-16")).toBe("不明"); expect(ageBand("生年月日", "2026-07-16")).toBe("不明"); expect(ageBand("1990/02/31", "2026-07-16")).toBe("不明"); expect(ageBand("2026/07/17", "2026-07-16")).toBe("不明"); expect(ageBand("2030/01/01", "2026-07-16")).toBe("不明"); expect(ageBand("1990/01/01", "invalid")).toBe("不明"); }); });
describe("occupationGroup", () => { it("粗いグループへ丸める", () => { expect(occupationGroup("会社員")).toBe("会社員"); expect(occupationGroup("鍼灸師")).toBe("医療・施術"); expect(occupationGroup("理学療法士")).toBe("医療・施術"); expect(occupationGroup("学生")).toBe("学生"); expect(occupationGroup("経営者")).toBe("経営・自営"); expect(occupationGroup("パイロット")).toBe("その他"); expect(occupationGroup("")).toBe("不明"); }); });
