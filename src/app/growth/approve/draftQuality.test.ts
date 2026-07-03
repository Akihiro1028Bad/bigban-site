import { describe, expect, it } from "vitest";

import {
  countByLevel,
  detectDoNotWrite,
  draftPlainText,
  draftQuality,
  extractInternalLinkPaths,
  findBrokenInternalLinks,
  hasBlockingCheck,
  QUALITY_THRESHOLDS,
} from "./draftQuality";
import type { QualityCheck } from "./draftQuality";

const DISCLAIMER = "※この記事はAIが作成した下書きです。公開前に内容をご確認ください。";

function pick(checks: ReturnType<typeof draftQuality>, label: string) {
  const found = checks.find((c) => c.label === label);
  if (!found) throw new Error(`check not found: ${label}`);
  return found;
}

function okHtml(): string {
  return (
    "<h2>見出し1</h2><h2>見出し2</h2>" +
    "<figure><img src='x'></figure>" +
    '<a href="/ja/news/a">内部</a>'
  );
}

describe("draftQuality", () => {
  it("十分な下書き(免責あり・断定なし)は全項目 ok・公開ブロックなし", () => {
    const body = "あ".repeat(QUALITY_THRESHOLDS.chars.single.min) + DISCLAIMER;
    const checks = draftQuality({ bodyHtml: okHtml(), body, title: "短いタイトル" });
    for (const label of ["文字数", "見出し", "画像", "内部リンク", "タイトル長", "AI免責文", "断定NG(可変情報)"]) {
      expect(pick(checks, label).level).toBe("ok");
    }
    expect(hasBlockingCheck(checks)).toBe(false);
  });

  it("文字数: 下限未満は warn、上限超過(水増し)は warn、境界は ok", () => {
    const { min, max } = QUALITY_THRESHOLDS.chars.single;
    expect(pick(draftQuality({ bodyHtml: "", body: "短い", title: "t" }), "文字数").level).toBe("warn");
    expect(pick(draftQuality({ bodyHtml: "", body: "あ".repeat(min), title: "t" }), "文字数").level).toBe("ok");
    expect(pick(draftQuality({ bodyHtml: "", body: "あ".repeat(max + 1), title: "t" }), "文字数").hint).toBe("水増し疑い(冗長)");
  });

  it("文字数: cornerstone は 3000字下限", () => {
    const body = "あ".repeat(QUALITY_THRESHOLDS.chars.single.min); // 1500: single では ok だが
    expect(pick(draftQuality({ bodyHtml: "", body, title: "t", articleType: "cornerstone" }), "文字数").level).toBe("warn");
  });

  it("見出し/画像/内部リンク/タイトル長 の不足は warn", () => {
    const checks = draftQuality({
      bodyHtml: "<p>短い</p>",
      body: "短い",
      title: "あ".repeat(QUALITY_THRESHOLDS.maxTitleLen + 1),
    });
    expect(pick(checks, "見出し").level).toBe("warn");
    expect(pick(checks, "画像").level).toBe("warn");
    expect(pick(checks, "画像").value).toBe("0 / 3");
    expect(pick(checks, "内部リンク").level).toBe("warn");
    expect(pick(checks, "タイトル長").level).toBe("warn");
  });

  it("内部リンクは thepicklebang.com とルート相対(/...)を数え、外部は除く", () => {
    const bodyHtml =
      '<a href="https://thepicklebang.com/x">in1</a>' +
      '<a href="/news/y">in2</a>' +
      '<a href="https://example.com/z">外部</a>';
    expect(pick(draftQuality({ bodyHtml, body: "x", title: "t" }), "内部リンク").value).toBe("2");
  });

  it("AI免責文が無いと block(赤・公開ブロック)", () => {
    const body = "あ".repeat(QUALITY_THRESHOLDS.chars.single.min); // 免責文なし
    const checks = draftQuality({ bodyHtml: okHtml(), body, title: "t" });
    expect(pick(checks, "AI免責文").level).toBe("block");
    expect(hasBlockingCheck(checks)).toBe(true);
  });

  it("§13 断定NG(料金/所要分)は block(#217: 未確定情報のみ)", () => {
    const base = { bodyHtml: "", title: "t" } as const;
    expect(pick(draftQuality({ ...base, body: `月額5,000円${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("block");
    expect(pick(draftQuality({ ...base, body: `本八幡駅から徒歩5分${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("block");
    expect(pick(draftQuality({ ...base, body: `徒歩10分の距離${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("block");
    expect(pick(draftQuality({ ...base, body: `駅から徒歩 3 分${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("block");
  });

  it("#217: 公表済み事実(営業時間6:00-23:00・3面)は block しない", () => {
    const base = { bodyHtml: "", title: "t" } as const;
    expect(pick(draftQuality({ ...base, body: `営業時間は6:00-23:00です${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("ok");
    expect(pick(draftQuality({ ...base, body: `コート3面を完備${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("ok");
  });

  it("#218レビュー対応: 確定値「徒歩1分」(CTA必須文)は block しない", () => {
    const base = { bodyHtml: "", title: "t" } as const;
    expect(pick(draftQuality({ ...base, body: `本八幡駅から徒歩1分${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("ok");
    expect(pick(draftQuality({ ...base, body: `徒歩１分でアクセス${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("ok");
    // 「1」で始まる複数桁(徒歩11分)は先読みが「1分」に一致しないため従来どおり block
    expect(pick(draftQuality({ ...base, body: `徒歩11分ほど${DISCLAIMER}` }), "断定NG(可変情報)").level).toBe("block");
  });

  it("body が空なら bodyHtml からタグを除いて判定する", () => {
    const bodyHtml = `<p>${"あ".repeat(QUALITY_THRESHOLDS.chars.single.min)}${DISCLAIMER}</p>`;
    expect(pick(draftQuality({ bodyHtml, body: "", title: "t" }), "文字数").level).toBe("ok");
  });
});

describe("extractInternalLinkPaths", () => {
  it("内部リンクを正規化パスで抽出し、外部は除く", () => {
    const html =
      '<a href="https://thepicklebang.com/ja/news/a?x=1#h">in1</a>' +
      '<a href="/ja/news/b/">in2</a>' +
      '<a href="https://example.com/z">外部</a>';
    expect(extractInternalLinkPaths(html)).toEqual(["/ja/news/a", "/ja/news/b"]);
  });

  it("ホスト/相対のルートは / に正規化し、href が無ければ空配列", () => {
    expect(extractInternalLinkPaths('<a href="https://thepicklebang.com/">top</a>')).toEqual(["/"]);
    expect(extractInternalLinkPaths('<a href="/">top</a>')).toEqual(["/"]);
    expect(extractInternalLinkPaths("<p>本文(リンク無し)</p>")).toEqual([]);
  });
});

describe("findBrokenInternalLinks", () => {
  const known = new Set(["/ja/news/exists"]);
  it("既知に無い記事リンクだけを壊れと判定(一覧/静的は対象外)", () => {
    const html =
      '<a href="/ja/news/exists">ok</a>' +
      '<a href="/ja/news/missing">壊れ</a>' +
      '<a href="/ja/news">一覧</a>' +
      '<a href="/ja/about">施設</a>';
    expect(findBrokenInternalLinks(html, known)).toEqual(["/ja/news/missing"]);
  });
  it("columns 記事リンクも検査対象(#columns: 公開先が columns の場合)", () => {
    const knownCols = new Set(["/ja/columns/exists"]);
    const html =
      '<a href="/ja/columns/exists">ok</a>' +
      '<a href="/ja/columns/missing">壊れ</a>';
    expect(findBrokenInternalLinks(html, knownCols)).toEqual([
      "/ja/columns/missing",
    ]);
  });
  it("#218: CTA 導線(予約=外部RESERVA・お問い合わせ=/#contact)は壊れ扱いしない", () => {
    const html =
      '<a href="https://reserva.be/tpbt">予約</a>' +
      '<a href="/#contact">お問い合わせ</a>';
    // 記事リンク(/ja/(news|columns)/<slug>)のみを検査対象とするため、
    // 外部CTA・トップ内アンカーは knownNewsPaths が空でも壊れにならない。
    expect(findBrokenInternalLinks(html, new Set())).toEqual([]);
  });
});

describe("draftQuality: 内部リンク先(#H19)", () => {
  const body = "あ".repeat(QUALITY_THRESHOLDS.chars.single.min) + DISCLAIMER;
  it("knownNewsPaths 未指定なら『内部リンク先』チェックは出さない", () => {
    const checks = draftQuality({ bodyHtml: okHtml(), body, title: "t" });
    expect(checks.find((c) => c.label === "内部リンク先")).toBeUndefined();
  });
  it("壊れ記事リンクがあると block", () => {
    const bodyHtml = okHtml() + '<a href="/ja/news/missing">壊れ</a>';
    const checks = draftQuality({ bodyHtml, body, title: "t", knownNewsPaths: new Set(["/ja/news/a"]) });
    expect(pick(checks, "内部リンク先").level).toBe("block");
  });
  it("全て実在すれば ok", () => {
    const checks = draftQuality({
      bodyHtml: okHtml(),
      body,
      title: "t",
      knownNewsPaths: new Set(["/ja/news/a"]),
    });
    expect(pick(checks, "内部リンク先").level).toBe("ok");
  });
});

describe("detectDoNotWrite", () => {
  it("該当カテゴリのラベルを返す(#217: 料金・所要分のみ)", () => {
    expect(detectDoNotWrite("本八幡駅から徒歩7分・月額3000円")).toEqual(["料金", "所要時間"]);
  });
  it("#217: 公表済みの面数・営業時間は検出しない", () => {
    expect(detectDoNotWrite("コート3面・営業時間6:00-23:00")).toEqual([]);
  });
  it("#218レビュー対応: 確定値「徒歩1分」は検出しない(全角１も)", () => {
    expect(detectDoNotWrite("本八幡駅から徒歩1分")).toEqual([]);
    expect(detectDoNotWrite("徒歩１分")).toEqual([]);
  });
  it("#218レビュー対応: 徒歩10分・駅から3分は従来どおり検出する", () => {
    expect(detectDoNotWrite("徒歩10分")).toEqual(["所要時間"]);
    expect(detectDoNotWrite("駅から3分")).toEqual(["所要時間"]);
  });
  it("該当なしは空", () => {
    expect(detectDoNotWrite("市川の屋内コートで打てる")).toEqual([]);
  });
});

describe("draftPlainText", () => {
  it("body 優先、無ければ bodyHtml のタグを除去する", () => {
    expect(draftPlainText("<p>x</p>", "本文")).toBe("本文");
    expect(draftPlainText("<p>タグ除去</p>", "")).toBe("タグ除去");
  });
});

describe("hasBlockingCheck", () => {
  it("block があれば true", () => {
    expect(hasBlockingCheck([{ label: "x", value: "", level: "block" }])).toBe(true);
  });
  it("warn/ok だけなら false", () => {
    expect(hasBlockingCheck([{ label: "x", value: "", level: "warn" }, { label: "y", value: "", level: "ok" }])).toBe(false);
  });
});

describe("countByLevel", () => {
  const checks: QualityCheck[] = [
    { label: "a", value: "", level: "block" },
    { label: "b", value: "", level: "warn" },
    { label: "c", value: "", level: "warn" },
    { label: "d", value: "", level: "ok" },
  ];

  it("レベルごとの件数を集計する", () => {
    expect(countByLevel(checks)).toEqual({ block: 1, warn: 2, ok: 1 });
  });

  it("空配列は全て 0", () => {
    expect(countByLevel([])).toEqual({ block: 0, warn: 0, ok: 0 });
  });
});
