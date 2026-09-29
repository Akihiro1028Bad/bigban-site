// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildAliasMap,
  canonicalPersonKey,
  personKeyOf,
  personKeyOfRecordKey,
  recordKeyOf,
  resolvePersonKey,
  sessionKeyOf,
  sessionKeyOfRecordKey,
  splitAliases,
} from "./identity";

describe("personKeyOf", () => {
  it("全角・半角の空白を除いて正規化した氏名をキーにする", () => {
    expect(personKeyOf("架空　一郎 ")).toBe("lb:架空一郎");
  });
});

describe("splitAliases", () => {
  it("読点・カンマで分け、空白だけの要素を除く", () => {
    expect(splitAliases(" かくう一郎、架空 壱郎,,，")).toEqual(["かくう一郎", "架空 壱郎"]);
  });
});

describe("buildAliasMap / canonicalPersonKey / resolvePersonKey", () => {
  it("別名の人キーを統合先へ向け、自分自身を指す別名は無視する", () => {
    const aliasMap = buildAliasMap([{ personKey: "lb:架空一郎", alias: "かくう一郎、架空　一郎" }]);
    expect([...aliasMap]).toEqual([["lb:かくう一郎", "lb:架空一郎"]]);
    expect(canonicalPersonKey("lb:かくう一郎", aliasMap)).toBe("lb:架空一郎");
    expect(canonicalPersonKey("lb:架空二郎", aliasMap)).toBe("lb:架空二郎");
    expect(resolvePersonKey("かくう 一郎", aliasMap)).toBe("lb:架空一郎");
  });
});

describe("開催回・参加記録のキー", () => {
  it("組み立てて分解できる", () => {
    const sessionKey = sessionKeyOf("2026-09-30", "20:00");
    const key = recordKeyOf(sessionKey, "lb:架空一郎");
    expect(key).toBe("2026-09-30_20:00_lb:架空一郎");
    expect(sessionKeyOfRecordKey(key)).toBe("2026-09-30_20:00");
    expect(personKeyOfRecordKey(key)).toBe("lb:架空一郎");
  });
});
