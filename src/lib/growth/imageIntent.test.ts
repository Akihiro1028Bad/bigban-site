import { describe, expect, it } from "vitest";

import {
  effectiveMode,
  imagePlanSummary,
  migrateImageHint,
  recommendOff,
  resolveAction,
  suggestActions,
} from "./imageIntent";
import type { ImageOutlineSection } from "@/app/growth/approve/imageIntentTypes";

function sec(over: Partial<ImageOutlineSection> = {}): ImageOutlineSection {
  return { heading: "見出し", summary: "", ...over };
}

describe("suggestActions", () => {
  it("キーワードから候補を出し常に1件以上・最大4件・重複なし", () => {
    const out = suggestActions(sec({ heading: "スイングのフォーム", summary: "初心者向け基本" }));
    expect(out.length).toBeGreaterThan(0);
    expect(out.length).toBeLessThanOrEqual(4);
    expect(new Set(out).size).toBe(out.length);
  });
  it("該当なしでもフォールバックを返す", () => {
    const out = suggestActions(sec({ heading: "無関係な語", summary: "" }));
    expect(out).toContain("コートに立つ");
  });
  it("summary 未定義でも見出しのみで判定する", () => {
    const out = suggestActions({ heading: "カフェ併設のラウンジ" });
    expect(out).toContain("カフェでくつろぐ");
  });
  it("複数パターン該当で重複actionは1件に畳まれ最大4件に切り詰める", () => {
    // 予約(ガッツポーズ) と まとめ(ガッツポーズ) が重複 → dedup。多数該当で slice(0,4)。
    const out = suggestActions(
      sec({ heading: "レッスン予約と比較のまとめ", summary: "選び方と道具レンタル" }),
    );
    expect(new Set(out).size).toBe(out.length);
    expect(out.length).toBe(4);
  });
});

describe("migrateImageHint", () => {
  it("プレフィクス付きヒントを custom action へ正規化", () => {
    expect(migrateImageHint("mascot: 案内する宇宙人")).toEqual({ mode: "custom", action: "案内する宇宙人" });
  });
  it("プレフィクスなしはそのまま action", () => {
    expect(migrateImageHint("コートを見渡す")).toEqual({ mode: "custom", action: "コートを見渡す" });
  });
  it("空/未定義は undefined", () => {
    expect(migrateImageHint(undefined)).toBeUndefined();
    expect(migrateImageHint("  ")).toBeUndefined();
    expect(migrateImageHint("diagram:   ")).toBeUndefined();
  });
});

describe("resolveAction", () => {
  it("off は空文字", () => {
    expect(resolveAction(sec(), { mode: "off" })).toBe("");
  });
  it("custom は action を返す", () => {
    expect(resolveAction(sec(), { mode: "custom", action: "手を振る" })).toBe("手を振る");
  });
  it("custom で action 空なら auto 推測へフォールバック", () => {
    expect(resolveAction(sec({ heading: "コート案内" }), { mode: "custom", action: "  " }).length).toBeGreaterThan(0);
  });
  it("inst 省略時は section.imageInstruction を見る", () => {
    expect(resolveAction(sec({ imageInstruction: { mode: "off" } }))).toBe("");
  });
  it("custom で action 未定義なら auto 推測へフォールバック", () => {
    expect(resolveAction(sec({ heading: "コート案内" }), { mode: "custom" }).length).toBeGreaterThan(0);
  });
  it("auto モードは見出しから推測する", () => {
    expect(resolveAction(sec({ heading: "スイングの基本" }), { mode: "auto" })).toBe("スイングする");
  });
});

describe("recommendOff", () => {
  it("まとめ/CTA 系はオフ推奨", () => {
    expect(recommendOff(sec({ heading: "まとめ" }), 2, 3)).toBe(true);
  });
  it("最終セクションが来店誘導ならオフ推奨", () => {
    expect(recommendOff(sec({ heading: "さあ", summary: "ぜひお越しください" }), 2, 3)).toBe(true);
  });
  it("通常セクションは false", () => {
    expect(recommendOff(sec({ heading: "スイングの基本" }), 0, 3)).toBe(false);
  });
  it("CTA 語を含んでも最終セクションでなければ false", () => {
    expect(recommendOff(sec({ heading: "ぜひ挑戦", summary: "" }), 0, 3)).toBe(false);
  });
  it("最終セクションでも total<3 なら false", () => {
    expect(recommendOff(sec({ heading: "ぜひお越しください" }), 1, 2)).toBe(false);
  });
  it("summary 未定義でも見出しのみで判定できる", () => {
    expect(recommendOff({ heading: "スイングの基本" }, 0, 3)).toBe(false);
  });
});

describe("effectiveMode / imagePlanSummary", () => {
  it("未設定は auto", () => {
    expect(effectiveMode(undefined)).toBe("auto");
    expect(effectiveMode({ mode: "off" })).toBe("off");
  });
  it("planned は off 以外の数・specified は custom の数", () => {
    const outline: ImageOutlineSection[] = [
      sec({ imageInstruction: { mode: "off" } }),
      sec({ imageInstruction: { mode: "auto" } }),
      sec({ imageInstruction: { mode: "custom", action: "x" } }),
      sec(), // 未設定=auto
    ];
    expect(imagePlanSummary(outline)).toEqual({ planned: 3, specified: 1 });
  });
});
