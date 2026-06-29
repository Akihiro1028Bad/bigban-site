import { describe, expect, it } from "vitest";

import {
  createConsult,
  findConsult,
  removeConsult,
  upsertConsult,
} from "./consultEngine";
import type { Consult } from "./types";

describe("consultEngine: 基本ライフサイクル", () => {
  it("createConsult は requested 状態の相談を作る", () => {
    const c = createConsult("c1", "overall", { overall: { focus: "導入" } });
    expect(c).toEqual({
      id: "c1",
      kind: "overall",
      status: "requested",
      input: { overall: { focus: "導入" } },
    });
  });

  it("upsertConsult は新規を追加し、既存idは置換する(イミュータブル)", () => {
    const a = createConsult("c1", "overall", {});
    const list1 = upsertConsult([], a);
    expect(list1).toHaveLength(1);

    const a2: Consult = { ...a, status: "presenting" };
    const list2 = upsertConsult(list1, a2);
    expect(list2).toHaveLength(1);
    expect(list2[0].status).toBe("presenting");
    expect(list1[0].status).toBe("requested"); // 元配列は不変
  });

  it("findConsult は id 一致を返し、無ければ undefined", () => {
    const a = createConsult("c1", "revise", {});
    expect(findConsult([a], "c1")).toBe(a);
    expect(findConsult([a], "zzz")).toBeUndefined();
  });

  it("removeConsult は id を除いた新配列を返す", () => {
    const a = createConsult("c1", "revise", {});
    const b = createConsult("c2", "sentence", {});
    const out = removeConsult([a, b], "c1");
    expect(out.map((c) => c.id)).toEqual(["c2"]);
  });
});
