// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildAliasMap,
  canonicalPersonKey,
  memberGroupsOf,
  personKeyOf,
  personKeyOfRecordKey,
  recordKeyOf,
  resolvePersonKey,
  sessionKeyOf,
  sessionKeyOfRecordKey,
  splitAliases,
} from "./identity";
import type { LedgerRow } from "./types";

function row(name: string, memberNo: string | null): LedgerRow {
  return {
    reservationNo: "#100",
    name,
    date: "2026-09-30",
    startTime: "20:00",
    isCancelled: false,
    court: "HYROX",
    kind: "イベント",
    memberNo,
    eventName: "",
  };
}

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

describe("buildAliasMap の相互・連鎖・重複", () => {
  it("両方の行に互いの別名を入れても入れ替わらない", () => {
    const aliasMap = buildAliasMap([
      { personKey: "lb:架空一郎", alias: "かくう一郎" },
      { personKey: "lb:かくう一郎", alias: "架空一郎" },
    ]);
    expect([...aliasMap]).toEqual([["lb:架空一郎", "lb:かくう一郎"]]);
    expect(canonicalPersonKey("lb:架空一郎", aliasMap)).toBe("lb:かくう一郎");
    expect(canonicalPersonKey("lb:かくう一郎", aliasMap)).toBe("lb:かくう一郎");
  });

  it("連鎖は最後まで寄せる", () => {
    const aliasMap = buildAliasMap([
      { personKey: "lb:A", alias: "B" },
      { personKey: "lb:B", alias: "C" },
    ]);
    expect(canonicalPersonKey("lb:A", aliasMap)).toBe("lb:A");
    expect(canonicalPersonKey("lb:B", aliasMap)).toBe("lb:A");
    expect(canonicalPersonKey("lb:C", aliasMap)).toBe("lb:A");
  });

  it("同じ別名を2人に書いたら同じ人にまとめる", () => {
    const aliasMap = buildAliasMap([
      { personKey: "lb:A", alias: "X" },
      { personKey: "lb:B", alias: "X" },
    ]);
    expect(canonicalPersonKey("lb:B", aliasMap)).toBe("lb:A");
    expect(canonicalPersonKey("lb:X", aliasMap)).toBe("lb:A");
  });

  it("別名がなければ空の対応表になる", () => {
    expect(buildAliasMap([]).size).toBe(0);
  });
});

describe("memberGroupsOf", () => {
  it("会員番号が同じで氏名の正規化キーが2つ以上ある行だけを、キーの昇順でまとめる", () => {
    const groups = memberGroupsOf([
      row("架空四郎", "99003"),
      row("架空三郎", "99003"),
      row("架空壱郎", "99001"),
      row("架空一郎", "99001"),
      row("架空　壱郎", "99001"),
      row("架空二郎", "99002"),
      row("架空 二郎", "99002"),
      row("架空弐郎", "99004"),
      row("架空　弐郎", "99004"),
      row("架空二郎", "99005"),
      row("架空参郎", "99005"),
      row("架空五郎", null),
      row("架空六郎", null),
    ]);
    // 「一」(U+4E00) < 「壱」(U+58F1)。外側は先頭のキー順
    expect(groups).toEqual([
      ["lb:架空一郎", "lb:架空壱郎"],
      ["lb:架空三郎", "lb:架空四郎"],
      ["lb:架空二郎", "lb:架空参郎"],
    ]);
  });

  it("同じ氏名の組が別の会員番号にも現れたら、同じグループが並ぶ(統合には影響しない)", () => {
    const groups = memberGroupsOf([row("架空一郎", "99001"), row("架空壱郎", "99001"), row("架空一郎", "99002"), row("架空壱郎", "99002")]);
    expect(groups).toEqual([
      ["lb:架空一郎", "lb:架空壱郎"],
      ["lb:架空一郎", "lb:架空壱郎"],
    ]);
  });

  it("会員番号がある行がなければ空", () => {
    expect(memberGroupsOf([row("架空一郎", null)])).toEqual([]);
    expect(memberGroupsOf([])).toEqual([]);
  });
});

describe("buildAliasMap の同一人物グループ(会員番号)", () => {
  it("別名の行がなければ、グループ内で最小のキーに統合する(「一」が「壱」より小さい)", () => {
    const aliasMap = buildAliasMap([], [["lb:架空壱郎", "lb:架空一郎"]]);
    expect([...aliasMap]).toEqual([["lb:架空壱郎", "lb:架空一郎"]]);
    expect(canonicalPersonKey("lb:架空一郎", aliasMap)).toBe("lb:架空一郎");
  });

  it("別名を入れた行がグループにあれば、最小でなくてもその行に統合する", () => {
    const aliasMap = buildAliasMap([{ personKey: "lb:架空壱郎", alias: "無関係の別名" }], [["lb:架空一郎", "lb:架空壱郎"]]);
    expect(canonicalPersonKey("lb:架空一郎", aliasMap)).toBe("lb:架空壱郎");
    expect(aliasMap.has("lb:架空壱郎")).toBe(false);
    // 別名で指した「無関係の別名」は別グループ(同じ人ではない)ではなく、壱郎の別名としてこのグループに入る
    expect(canonicalPersonKey("lb:無関係の別名", aliasMap)).toBe("lb:架空壱郎");
  });

  it("別名と会員番号のグループが2つの別名グループをつなぐと、1つにまとまる", () => {
    const aliasMap = buildAliasMap(
      [
        { personKey: "lb:B", alias: "B2" },
        { personKey: "lb:A", alias: "A2" },
      ],
      [["lb:A2", "lb:B2"]],
    );
    expect(canonicalPersonKey("lb:B", aliasMap)).toBe("lb:A");
    expect(canonicalPersonKey("lb:A2", aliasMap)).toBe("lb:A");
    expect(canonicalPersonKey("lb:B2", aliasMap)).toBe("lb:A");
    expect(aliasMap.has("lb:A")).toBe(false);
  });

  it("1つのキーだけのグループは何も統合しない", () => {
    expect(buildAliasMap([], [["lb:A"], []]).size).toBe(0);
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
