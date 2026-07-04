// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BODY_IMAGE_MAX,
  bodyImageFileStem,
  bodyImagePlaceholder,
  buildBodyImageAlt,
  buildBodyImageFailureMessage,
  buildBodyImagePrompt,
  buildBodyImageSpec,
  capBodyImageSpecs,
  normalizeBodyImageStyle,
  placeholderIndices,
  resolveBodyImages,
  substituteBodyImages,
  type BodyImageSpec,
  type ResolvedBodyImage,
} from "./body-image";

describe("buildBodyImagePrompt (P2 styles)", () => {
  it("illust は雰囲気イラスト・文字なし・競技固定句を含む", () => {
    const p = buildBodyImagePrompt("illust", "夏の練習風景");
    expect(p).toContain("夏の練習風景");
    expect(p).toMatch(/illustration/i);
    expect(p).toMatch(/No text/i);
    expect(p).toContain("#F6FF54");
    expect(p).toMatch(/pickleball/i); // PICKLEBALL_ANCHOR 付与
    expect(p).toMatch(/table tennis/i); // NO_TABLE_TENNIS 付与
  });

  it("court はコート図・textSpec 明示分のみ描く・競技固定句は付けない", () => {
    const p = buildBodyImagePrompt("court", "非揮発ゾーン(キッチン)の位置");
    expect(p).toContain("非揮発ゾーン(キッチン)の位置");
    expect(p).toMatch(/court/i);
    // 文字・数値は明示指定分のみ(捏造防止)。
    expect(p).toMatch(/only the exact text and numbers/i);
    // 概念図には卓球バイアス句を付けない。
    expect(p).not.toMatch(/table tennis/i);
  });

  it("flow は手順・フロー図・明示指定分のみの文字", () => {
    const p = buildBodyImagePrompt("flow", "予約から入場までの流れ");
    expect(p).toContain("予約から入場までの流れ");
    expect(p).toMatch(/flow|step/i);
    expect(p).toMatch(/only the exact text and numbers/i);
    expect(p).not.toMatch(/table tennis/i);
  });

  it("infographic は比較・インフォグラフィック・明示指定分のみの文字", () => {
    const p = buildBodyImagePrompt("infographic", "テニスとの違い");
    expect(p).toContain("テニスとの違い");
    expect(p).toMatch(/infographic/i);
    expect(p).toMatch(/only the exact text and numbers/i);
    expect(p).not.toMatch(/table tennis/i);
  });

  it("mascot は従来どおり参照キャラ・宇宙シーン・競技固定句", () => {
    const p = buildBodyImagePrompt("mascot", "宇宙人がサーブする");
    expect(p).toContain("宇宙人がサーブする");
    expect(p).toMatch(/alien/i);
    expect(p).toMatch(/table tennis/i);
  });
});

describe("normalizeBodyImageStyle", () => {
  it("新5キーはそのまま返す", () => {
    for (const s of ["mascot", "illust", "court", "flow", "infographic"] as const) {
      expect(normalizeBodyImageStyle(s)).toBe(s);
    }
  });
  it("旧 minimal は illust・旧 diagram は court へマップする", () => {
    expect(normalizeBodyImageStyle("minimal")).toBe("illust");
    expect(normalizeBodyImageStyle("diagram")).toBe("court");
  });
  it("空・未知・auto は既定 mascot", () => {
    expect(normalizeBodyImageStyle("")).toBe("mascot");
    expect(normalizeBodyImageStyle("unknown")).toBe("mascot");
    expect(normalizeBodyImageStyle("auto")).toBe("mascot");
  });
});

describe("buildBodyImageAlt (P2 styles)", () => {
  it("court/flow/infographic は『イメージ図』を明示する", () => {
    expect(buildBodyImageAlt("court", " コート図 ")).toBe("イメージ図: コート図");
    expect(buildBodyImageAlt("flow", "手順")).toBe("イメージ図: 手順");
    expect(buildBodyImageAlt("infographic", "比較")).toBe("イメージ図: 比較");
  });
  it("mascot/illust は説明をそのまま返す", () => {
    expect(buildBodyImageAlt("mascot", " 宇宙人 ")).toBe("宇宙人");
    expect(buildBodyImageAlt("illust", "練習風景")).toBe("練習風景");
  });
});

describe("buildBodyImageSpec", () => {
  it("index・スタイル・正規化した説明・prompt/alt を揃える(#88: caption なし)", () => {
    const spec = buildBodyImageSpec(2, "court", "  ゾーン図  ");
    expect(spec).toEqual({
      index: 2,
      style: "court",
      description: "ゾーン図",
      prompt: buildBodyImagePrompt("court", "ゾーン図"),
      alt: "イメージ図: ゾーン図",
    });
  });

  it("説明の改行・連続空白を1行に正規化する(プロンプト混入の防御)", () => {
    const spec = buildBodyImageSpec(1, "mascot", "宇宙人が\n\n  サーブ");
    expect(spec.description).toBe("宇宙人が サーブ");
  });

  it("index が1未満は例外(無音の不正プレースホルダを防ぐ)", () => {
    expect(() => buildBodyImageSpec(0, "mascot", "x")).toThrow(/1 以上/);
  });
});

describe("プレースホルダ", () => {
  it("bodyImagePlaceholder は {{IMG:n}} を返す", () => {
    expect(bodyImagePlaceholder(1)).toBe("{{IMG:1}}");
  });

  it("placeholderIndices は本文中の index を出現順に返す", () => {
    expect(placeholderIndices("a {{IMG:1}} b {{IMG:3}} c")).toEqual([1, 3]);
  });

  it("プレースホルダが無ければ空配列", () => {
    expect(placeholderIndices("画像なしの本文")).toEqual([]);
  });
});

describe("BODY_IMAGE_MAX", () => {
  it("上限は3枚(#61 と整合)", () => {
    expect(BODY_IMAGE_MAX).toBe(3);
  });
});

const resolved = (index: number, over: Partial<ResolvedBodyImage> = {}): ResolvedBodyImage => ({
  index,
  url: `https://images.microcms-assets.io/img${index}.png`,
  alt: `alt${index}`,
  ...over,
});

describe("substituteBodyImages", () => {
  it("{{IMG:n}} を <figure><img alt> へ置換する(#88: figcaption なし)", () => {
    const html = substituteBodyImages("前 {{IMG:1}} 後", [resolved(1)]);
    expect(html).toBe(
      '前 <figure><img src="https://images.microcms-assets.io/img1.png" alt="alt1"></figure> 後'
    );
  });

  it("resolved に無い(失敗/欠番)プレースホルダは除去する", () => {
    expect(substituteBodyImages("a {{IMG:1}} b {{IMG:2}} c", [resolved(1)])).toBe(
      'a <figure><img src="https://images.microcms-assets.io/img1.png" alt="alt1"></figure> b  c'
    );
  });

  it("alt・url の特殊文字をエスケープする", () => {
    const html = substituteBodyImages("{{IMG:1}}", [
      resolved(1, { alt: 'a<b>&"', url: "https://images.microcms-assets.io/a&b.png" }),
    ]);
    expect(html).toContain('alt="a&lt;b&gt;&amp;&quot;"');
    expect(html).toContain('src="https://images.microcms-assets.io/a&amp;b.png"');
    expect(html).not.toContain("<figcaption>");
  });
});

describe("resolveBodyImages", () => {
  const specs: BodyImageSpec[] = [
    buildBodyImageSpec(1, "mascot", "宇宙人"),
    buildBodyImageSpec(2, "court", "コート図"),
  ];

  it("成功分は resolved、失敗分は failures に分け、1枚失敗でも続行する", async () => {
    const { resolved: ok, failures } = await resolveBodyImages(specs, async (spec) => {
      if (spec.index === 2) throw new Error("upload 502");
      return "https://images.microcms-assets.io/ok.png";
    });
    expect(ok).toEqual([
      {
        index: 1,
        url: "https://images.microcms-assets.io/ok.png",
        alt: "宇宙人",
      },
    ]);
    expect(failures).toEqual([
      { index: 2, description: "コート図", error: "upload 502" },
    ]);
  });

  it("Error でない throw も文字列化して failures に入れる", async () => {
    const { failures } = await resolveBodyImages([specs[0]], async () => {
      throw "boom";
    });
    expect(failures[0].error).toBe("boom");
  });
});

describe("capBodyImageSpecs", () => {
  it("3枚までを kept、超過を dropped にする", () => {
    const specs = [1, 2, 3, 4].map((i) => buildBodyImageSpec(i, "illust", `d${i}`));
    const { kept, dropped } = capBodyImageSpecs(specs);
    expect(kept.map((s) => s.index)).toEqual([1, 2, 3]);
    expect(dropped.map((s) => s.index)).toEqual([4]);
  });
});

describe("buildBodyImageFailureMessage", () => {
  it("タイトルと失敗した画像の説明・理由・再実行案内を含む", () => {
    const msg = buildBodyImageFailureMessage("市川の記事", [
      { index: 2, description: "コート図", error: "502" },
    ]);
    expect(msg).toContain("市川の記事");
    expect(msg).toContain("コート図");
    expect(msg).toContain("502");
    expect(msg).toContain("再実行");
  });
});

describe("bodyImageFileStem", () => {
  it("同一(slug+style+説明)なら決定的に同じ stem(冪等キャッシュ)", () => {
    const spec = buildBodyImageSpec(1, "court", "コート図");
    expect(bodyImageFileStem("my-slug", spec)).toBe(bodyImageFileStem("my-slug", spec));
  });

  it("説明やスタイルが違えば stem も変わる", () => {
    const a = buildBodyImageSpec(1, "court", "図A");
    const b = buildBodyImageSpec(1, "court", "図B");
    const c = buildBodyImageSpec(1, "illust", "図A");
    expect(bodyImageFileStem("s", a)).not.toBe(bodyImageFileStem("s", b));
    expect(bodyImageFileStem("s", a)).not.toBe(bodyImageFileStem("s", c));
  });

  it("slug を英数字・ハイフンに正規化する(パス・トラバーサル防止)", () => {
    const spec = buildBodyImageSpec(1, "mascot", "x");
    const stem = bodyImageFileStem("../../etc/Passwd 注入", spec);
    expect(stem).not.toMatch(/[./\\ ]/);
    expect(stem).toContain("etc-passwd");
  });
});
