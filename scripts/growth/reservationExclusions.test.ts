import { describe, expect, it } from "vitest";
import { isExcluded, parseExclusionRules } from "./reservationExclusions";

const rules = { emails: ["owner@example.com"], nameContains: ["テスト"] };
describe("parseExclusionRules", () => {
  it("正しいJSONを受理する", () => expect(parseExclusionRules('{"emails":["a@b.c"],"nameContains":["x"]}')).toEqual({ emails: ["a@b.c"], nameContains: ["x"] }));
  it("形式不正はエラー", () => expect(() => parseExclusionRules('{"emails":"x"}')).toThrow("除外設定"));
  it("JSONとして不正な設定はエラー", () => expect(() => parseExclusionRules("{")).toThrow("JSON"));
});
describe("isExcluded", () => {
  it("メール完全一致で除外", () => expect(isExcluded({ email: "Owner@Example.com", name: "誰か" }, rules)).toBe(true));
  it("名前部分一致で除外", () => expect(isExcluded({ email: "x@y.z", name: "▲テスト太郎" }, rules)).toBe(true));
  it("該当なしは残す", () => expect(isExcluded({ email: "x@y.z", name: "本物顧客" }, rules)).toBe(false));
  it("メールが空でも名前規則で判定する", () => expect(isExcluded({ email: "", name: "テスト利用" }, rules)).toBe(true));
});
