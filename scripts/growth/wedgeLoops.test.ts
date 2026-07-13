import { describe, expect, it } from "vitest";

import { ADVISE_PROPS } from "./advise";
import { ADVISE_APPLY_PROPS } from "./advise-apply";
import { BODY_REGEN_PROPS } from "./body-image-regen";
import { BODY_COMMENT_PROPS } from "./bodyComment";
import { DECORATE_PROPS } from "./decorate";
import { REGEN_PROPS } from "./eyecatch-regen";
import { REVISE_PROPS } from "./revise";
import { formatWedgeTitle, WEDGE_LOOPS } from "./wedgeLoops";

describe("WEDGE_LOOPS(全 pull 型ループの wedge 検知対象・#220-4)", () => {
  it("7つの pull 型ループすべてを網羅する(revise 限定にしない)", () => {
    expect(WEDGE_LOOPS).toHaveLength(7);
    const labels = WEDGE_LOOPS.map((l) => l.label);
    expect(new Set(labels).size).toBe(7); // ラベル重複なし
    expect(WEDGE_LOOPS.map((loop) => loop.mode)).toEqual([
      "revise",
      "advise",
      "decorate",
      "regen",
      "regen-body",
      "apply",
      "comment-revise",
    ]);
  });

  it("各ループの status / requestedAt プロパティ名が正典(*_PROPS)と一致する", () => {
    const byLabel = new Map(WEDGE_LOOPS.map((l) => [l.label, l]));
    const expectPair = (
      label: string,
      props: { status: string; requestedAt: string }
    ): void => {
      const loop = byLabel.get(label);
      expect(loop, `${label} が登録されていること`).toBeDefined();
      expect(loop?.statusProp).toBe(props.status);
      expect(loop?.requestedAtProp).toBe(props.requestedAt);
    };
    expectPair("構成案修正", REVISE_PROPS);
    expectPair("アドバイス", ADVISE_PROPS);
    expectPair("装飾", DECORATE_PROPS);
    expectPair("アイキャッチ再生成", REGEN_PROPS);
    expectPair("本文画像再生成", BODY_REGEN_PROPS);
    expectPair("アドバイス反映", ADVISE_APPLY_PROPS);
    expectPair("本文コメント", BODY_COMMENT_PROPS);
  });
});

describe("formatWedgeTitle", () => {
  it("記事タイトルにどのループの wedge かを併記する", () => {
    expect(formatWedgeTitle("屋内ピックル入門", "アドバイス")).toBe(
      "屋内ピックル入門（アドバイス）"
    );
  });

  it("タイトル空は (無題) にフォールバックする", () => {
    expect(formatWedgeTitle("  ", "構成案修正")).toBe("(無題)（構成案修正）");
  });
});
