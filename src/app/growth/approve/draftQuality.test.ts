import { describe, expect, it } from "vitest";

import {
  countByLevel,
  detectCitationRequired,
  detectProhibitedClaims,
  detectUnsafeHtml,
  DISCLAIMER_MARK,
  draftPlainText,
  draftQuality,
  extractInternalLinkPaths,
  findBrokenInternalLinks,
  hasBlockingCheck,
  QUALITY_THRESHOLDS,
  summarizeStyleWarnings,
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
    for (const label of ["文字数", "見出し", "画像", "内部リンク", "文体注意", "要出典", "禁止表現", "HTML安全性", "AI免責文"]) {
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

  it("見出し/画像/内部リンク の不足は warn、承認済みタイトルの長さは再評価しない", () => {
    const checks = draftQuality({
      bodyHtml: "<p>短い</p>",
      body: "短い",
      title: "ピックルボール、市川市でどこでできる？場所の選び方ガイド【体育館・クラブ・屋内専用施設】",
    });
    expect(pick(checks, "見出し").level).toBe("warn");
    expect(pick(checks, "画像").level).toBe("warn");
    expect(pick(checks, "画像").value).toBe("0 / 3");
    expect(pick(checks, "内部リンク").level).toBe("warn");
    expect(checks.find((check) => check.label === "タイトル長")).toBeUndefined();
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

  it("DISCLAIMER_MARK は export され、AI免責文チェックの判定は不変", () => {
    const withDisclaimer = draftQuality({
      bodyHtml: "",
      body: `本文 ${DISCLAIMER_MARK}`,
      title: "t",
    });
    const withoutDisclaimer = draftQuality({ bodyHtml: "", body: "本文", title: "t" });

    expect(DISCLAIMER_MARK).toBe("AIが作成した下書き");
    expect(pick(withDisclaimer, "AI免責文").level).toBe("ok");
    expect(pick(withoutDisclaimer, "AI免責文").level).toBe("block");
  });

  it("料金/所要分は要出典 warn だが block しない", () => {
    const base = { bodyHtml: "", title: "t" } as const;
    for (const body of [
      `一般230円・市外690円です。${DISCLAIMER}`,
      `コート料金は平日4,980円です。${DISCLAIMER}`,
      `本八幡駅から徒歩5分です。${DISCLAIMER}`,
      `駅から徒歩 3 分です。${DISCLAIMER}`,
    ]) {
      const checks = draftQuality({ ...base, body });
      expect(pick(checks, "要出典").level).toBe("warn");
      expect(hasBlockingCheck(checks)).toBe(false);
    }
  });

  it("料金/所要分が無ければ要出典チェックは ok", () => {
    const base = { bodyHtml: "", title: "t" } as const;
    expect(pick(draftQuality({ ...base, body: `屋内コートです。${DISCLAIMER}` }), "要出典").level).toBe("ok");
  });

  it("明確な禁止表現は block する", () => {
    const base = { bodyHtml: "", title: "t" } as const;
    for (const body of [
      "24時間営業です",
      "国内最大規模です",
      "キャンペーン価格です",
      "クーポンコードを配布します",
      "体験会は7月20日に開催します",
      "ラウンジスペースを利用できます",
    ]) {
      expect(pick(draftQuality({ ...base, body: `${body}${DISCLAIMER}` }), "禁止表現").level).toBe("block");
    }
  });

  it("公式確認済みの可変情報は要出典warnに留める", () => {
    const body = `体験会は7月20日に開催します。${DISCLAIMER}`;
    const checks = draftQuality({
      bodyHtml: "",
      body,
      title: "体験会",
      confirmedFacts: ["体験会は7月20日に開催します"],
    });

    expect(pick(checks, "禁止表現").level).toBe("ok");
    expect(pick(checks, "要出典").level).toBe("warn");
  });

  it("句点なし・確認済み事実側が長い場合も可変情報の一致を判定する", () => {
    expect(
      detectProhibitedClaims("体験会は7月20日に開催します", ["体験会は7月20日に開催します"])
    ).toEqual([]);
    expect(
      detectProhibitedClaims("クーポンコードを配布します", [
        "現在はクーポンコードを配布します",
      ])
    ).toEqual([]);
    expect(detectProhibitedClaims("体験会は7月20日に開催します", ["短い"])).toEqual([
      "未確定イベント",
    ]);
  });

  it("禁止表現を否定・訂正する文章は block しない", () => {
    const base = { bodyHtml: "", title: "t" } as const;
    for (const body of [
      "24時間営業ではありません",
      "国内最大規模ではありません",
      "体験会は7月20日に開催しません",
      "ラウンジスペースは利用できません",
    ]) {
      expect(pick(draftQuality({ ...base, body: `${body}${DISCLAIMER}` }), "禁止表現").level).toBe("ok");
    }
  });

  it("禁止HTML・危険属性は block する", () => {
    const checks = draftQuality({
      bodyHtml: `<script>alert(1)</script><p onclick="alert(1)">本文${DISCLAIMER}</p>`,
      body: "",
      title: "t",
    });
    expect(pick(checks, "HTML安全性").level).toBe("block");
    expect(pick(checks, "HTML安全性").value).toContain("script");
    expect(pick(checks, "HTML安全性").value).toContain("onclick");
  });

  it("body が空なら bodyHtml からタグを除いて判定する", () => {
    const bodyHtml = `<p>${"あ".repeat(QUALITY_THRESHOLDS.chars.single.min)}${DISCLAIMER}</p>`;
    expect(pick(draftQuality({ bodyHtml, body: "", title: "t" }), "文字数").level).toBe("ok");
  });

  it("文体注意: styleLint ヒットで warn になりカテゴリ別件数を表示する", () => {
    const checks = draftQuality({
      bodyHtml: "",
      body: `この記事では最高の始め方を紹介します。${DISCLAIMER}`,
      title: "文体チェック",
    });

    const check = pick(checks, "文体注意");
    expect(check.level).toBe("warn");
    expect(check.value).toContain("3(");
    expect(check.value).toContain("誇大1");
    expect(check.value).toContain("メタ言及2");
    expect(check.hint).toContain("§6/§14");
  });

  it("文体注意: styleLint ヒット無しで ok・value=0", () => {
    const checks = draftQuality({
      bodyHtml: "",
      body: `本八幡駅近くの屋内コートで、天候を気にせず練習できます。${DISCLAIMER}`,
      title: "文体チェック",
    });

    expect(pick(checks, "文体注意")).toEqual({
      label: "文体注意",
      value: "0",
      level: "ok",
    });
  });

  it("文体注意 warn は block 判定に影響しない", () => {
    const body = "あ".repeat(QUALITY_THRESHOLDS.chars.single.min) + `最高です。${DISCLAIMER}`;
    const checks = draftQuality({ bodyHtml: okHtml(), body, title: "文体チェック" });

    expect(pick(checks, "文体注意").level).toBe("warn");
    expect(hasBlockingCheck(checks)).toBe(false);
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

describe("品質ゲートの事実・HTML検出", () => {
  it("料金・所要時間を要出典として返す", () => {
    expect(detectCitationRequired("本八幡駅から徒歩7分・月額3000円")).toEqual(["料金", "所要時間"]);
  });
  it("要出典対象が無ければ空", () => {
    expect(detectCitationRequired("市川の屋内コートで打てる")).toEqual([]);
  });
  it("明確な禁止表現を返す", () => {
    expect(
      detectProhibitedClaims(
        "24時間営業で国内最大規模です。体験会は7月20日に開催します。ラウンジスペースを利用できます"
      )
    ).toEqual(["24時間営業", "国内最大", "未確定イベント", "ラウンジ利用"]);
  });
  it("イベントの開催予定を公式情報で確認する案内は未確定イベント扱いしない", () => {
    expect(
      detectProhibitedClaims(
        "一人でも参加しやすいレッスンやイベントも用意されているので、開催予定や募集内容は最新の公式情報で確認してみてください。"
      )
    ).toEqual([]);
    expect(detectProhibitedClaims("体験会を開催予定です。内容は後日案内します。")).toEqual([
      "未確定イベント",
    ]);
  });
  it("安全なHTMLは空、禁止タグとイベント属性を返す", () => {
    expect(detectUnsafeHtml("<h2>見出し</h2><p>本文</p>")).toEqual([]);
    expect(detectUnsafeHtml('<iframe src="x"></iframe><p onload="x">本文</p>')).toEqual(["iframe", "onload"]);
  });

  it("禁止属性と重複イベント属性を重複なしで返す", () => {
    expect(
      detectUnsafeHtml('<p style="color:red" onclick="a"><span onclick="b">本文</span></p>')
    ).toEqual(["style", "onclick"]);
  });

  it("外部リンクへ付与された安全な target・rel は許可し、不正な組み合わせは拒否する", () => {
    expect(
      detectUnsafeHtml(
        '<a href="https://example.com" target="_blank" rel="noopener noreferrer">公式サイト</a>'
      )
    ).toEqual([]);
    expect(detectUnsafeHtml('<a href="https://example.com" target="_blank">外部</a>')).toContain(
      "rel"
    );
    expect(
      detectUnsafeHtml('<a href="https://example.com" target="popup" rel="noopener">外部</a>')
    ).toEqual(expect.arrayContaining(["target", "rel"]));
    expect(
      detectUnsafeHtml(
        '<a href="https://example.com" target="_blank" rel="opener noopener noreferrer">外部</a>'
      )
    ).toContain("rel");
    expect(detectUnsafeHtml('<img src="x" target="_blank" rel="noopener noreferrer">')).toEqual([
      "target",
      "rel",
    ]);
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

  it("draftQuality の文体注意 warn も warn 件数に含める", () => {
    const body = "あ".repeat(QUALITY_THRESHOLDS.chars.single.min) + `最高です。${DISCLAIMER}`;
    const checks = draftQuality({ bodyHtml: okHtml(), body, title: "文体チェック" });

    expect(countByLevel(checks)).toEqual({ block: 0, warn: 1, ok: 9 });
  });
});

describe("summarizeStyleWarnings", () => {
  it("文体注意 warn があれば人向け1行を返す", () => {
    const summary = summarizeStyleWarnings(
      `<p>この記事では最高の始め方を紹介します。${DISCLAIMER}</p>`,
      "文体チェック"
    );

    expect(summary).not.toBeNull();
    expect(summary).toContain("3(");
    expect(summary).toContain("誇大1");
    expect(summary).toContain("メタ言及2");
    expect(summary).toContain("§6/§14");
  });

  it("文体注意 warn には必ず hint が付くため要約は固定 hint を使う", () => {
    const checks = draftQuality({
      bodyHtml: "",
      body: `この記事では最高の始め方を紹介します。${DISCLAIMER}`,
      title: "文体チェック",
    });
    const warning = pick(checks, "文体注意");

    expect(warning).toMatchObject({
      level: "warn",
      hint: "§6/§14 の要確認語(誤検知あり・人が判断)",
    });
    expect(
      summarizeStyleWarnings(
        `<p>この記事では最高の始め方を紹介します。${DISCLAIMER}</p>`,
        "文体チェック"
      )
    ).toContain(warning.hint);
  });

  it("文体注意 warn が無ければ null", () => {
    expect(
      summarizeStyleWarnings(
        `<p>本八幡駅近くの屋内コートで、天候を気にせず練習できます。${DISCLAIMER}</p>`,
        "文体チェック"
      )
    ).toBeNull();
  });
});
