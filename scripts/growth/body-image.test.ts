// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  BODY_IMAGE_MAX,
  bodyImageFileStem,
  bodyImagePlaceholder,
  buildBodyImageAlt,
  buildBodyImageCaption,
  buildBodyImageFailureMessage,
  buildBodyImagePrompt,
  buildBodyImageSpec,
  capBodyImageSpecs,
  placeholderIndices,
  resolveBodyImages,
  substituteBodyImages,
  type BodyImageSpec,
  type ResolvedBodyImage,
} from "./body-image";

describe("buildBodyImagePrompt", () => {
  it("mascot は参照キャラと宇宙シーンを含み、説明を埋める", () => {
    const p = buildBodyImagePrompt("mascot", " 宇宙人がサーブする ");
    expect(p).toContain("宇宙人がサーブする");
    expect(p).toMatch(/alien/i);
    expect(p).toContain("#F6FF54");
    expect(p).toMatch(/No text/i);
  });

  it("minimal はミニマル・文字なしで説明を埋める", () => {
    const p = buildBodyImagePrompt("minimal", "パドルの握り方");
    expect(p).toContain("パドルの握り方");
    expect(p).toMatch(/[Mm]inimal/);
    expect(p).toMatch(/No text/i);
  });

  it("diagram は概念図・文字最小で説明を埋める", () => {
    const p = buildBodyImagePrompt("diagram", "キッチンの位置関係");
    expect(p).toContain("キッチンの位置関係");
    expect(p).toMatch(/diagram/i);
    expect(p).toMatch(/avoid garbled text/i);
  });
});

describe("buildBodyImageAlt / buildBodyImageCaption", () => {
  it("diagram は alt・caption に「イメージ図」を明示する", () => {
    expect(buildBodyImageAlt("diagram", " コート図 ")).toBe("イメージ図: コート図");
    expect(buildBodyImageCaption("diagram", "コート図")).toBe("コート図（イメージ図）");
  });

  it("mascot / minimal は説明をそのまま使う", () => {
    expect(buildBodyImageAlt("mascot", "宇宙人")).toBe("宇宙人");
    expect(buildBodyImageCaption("minimal", "握り方")).toBe("握り方");
  });
});

describe("buildBodyImageSpec", () => {
  it("index・スタイル・正規化した説明・prompt/alt/caption を揃える", () => {
    const spec = buildBodyImageSpec(2, "diagram", "  ゾーン図  ");
    expect(spec).toEqual({
      index: 2,
      style: "diagram",
      description: "ゾーン図",
      prompt: buildBodyImagePrompt("diagram", "ゾーン図"),
      alt: "イメージ図: ゾーン図",
      caption: "ゾーン図（イメージ図）",
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
  caption: `cap${index}`,
  ...over,
});

describe("substituteBodyImages", () => {
  it("{{IMG:n}} を <figure><img alt><figcaption> へ置換する", () => {
    const html = substituteBodyImages("前 {{IMG:1}} 後", [resolved(1)]);
    expect(html).toBe(
      '前 <figure><img src="https://images.microcms-assets.io/img1.png" alt="alt1"><figcaption>cap1</figcaption></figure> 後'
    );
  });

  it("resolved に無い(失敗/欠番)プレースホルダは除去する", () => {
    expect(substituteBodyImages("a {{IMG:1}} b {{IMG:2}} c", [resolved(1)])).toBe(
      'a <figure><img src="https://images.microcms-assets.io/img1.png" alt="alt1"><figcaption>cap1</figcaption></figure> b  c'
    );
  });

  it("alt・caption・url の特殊文字をエスケープする", () => {
    const html = substituteBodyImages("{{IMG:1}}", [
      resolved(1, { alt: 'a<b>&"', caption: "x<y>", url: "https://images.microcms-assets.io/a&b.png" }),
    ]);
    expect(html).toContain('alt="a&lt;b&gt;&amp;&quot;"');
    expect(html).toContain("<figcaption>x&lt;y&gt;</figcaption>");
    expect(html).toContain('src="https://images.microcms-assets.io/a&amp;b.png"');
  });
});

describe("resolveBodyImages", () => {
  const specs: BodyImageSpec[] = [
    buildBodyImageSpec(1, "mascot", "宇宙人"),
    buildBodyImageSpec(2, "diagram", "コート図"),
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
        caption: "宇宙人",
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
    const specs = [1, 2, 3, 4].map((i) => buildBodyImageSpec(i, "minimal", `d${i}`));
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
    const spec = buildBodyImageSpec(1, "diagram", "コート図");
    expect(bodyImageFileStem("my-slug", spec)).toBe(bodyImageFileStem("my-slug", spec));
  });

  it("説明やスタイルが違えば stem も変わる", () => {
    const a = buildBodyImageSpec(1, "diagram", "図A");
    const b = buildBodyImageSpec(1, "diagram", "図B");
    const c = buildBodyImageSpec(1, "minimal", "図A");
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
