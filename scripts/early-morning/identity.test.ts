// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildLinkMap, lbKey, normalizeName, personKeyOfRecordKey, recordKey, resolveLbKey, tbKey } from "./identity";

describe("identity", () => {
  it("全角・半角の空白を除き NFKC で揃える", () => {
    expect(normalizeName("テスト　太郎")).toBe("テスト太郎");
    expect(normalizeName(" テスト 太郎 ")).toBe("テスト太郎");
    expect(normalizeName("ﾃｽﾄ")).toBe("テスト");
  });

  it("人キーと記録キーを作り、記録キーから人キーを戻す", () => {
    expect(tbKey(148195)).toBe("tb:148195");
    expect(lbKey("テスト　太郎")).toBe("lb:テスト太郎");
    const key = recordKey("2026-09-22", "lb:テスト太郎");
    expect(key).toBe("2026-09-22_lb:テスト太郎");
    expect(personKeyOfRecordKey(key)).toBe("lb:テスト太郎");
  });

  it("対応表にある LaBOLA 氏名はテニスベアの人キーに寄せる", () => {
    const linkMap = buildLinkMap([{ tbId: 7, lbName: "テスト　太郎" }]);
    expect(resolveLbKey("テスト太郎", linkMap)).toBe("tb:7");
    expect(resolveLbKey("テスト次郎", linkMap)).toBe("lb:テスト次郎");
  });
});
