// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  buildDraftEditPayload,
  classifyPreservedBlock,
  countDraftCharacters,
  DECORATION_OPTIONS,
  replaceImgSrcInHtml,
  sanitizeDraftHtml,
} from "./draftEditorContent";

describe("sanitizeDraftHtml", () => {
  it("許可外タグ(script)を除去し、許可タグは残す", () => {
    const out = sanitizeDraftHtml("<p>本文</p><script>alert(1)</script>");
    expect(out).toContain("本文");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("見出し・リスト・強調などの装飾は維持する", () => {
    const out = sanitizeDraftHtml("<h2>見出し</h2><ul><li><strong>太字</strong></li></ul>");
    expect(out).toContain("<h2>見出し</h2>");
    expect(out).toContain("<strong>太字</strong>");
    expect(out).toContain("<li>");
  });
});

describe("buildDraftEditPayload", () => {
  it("pageId と 正規化した bodyHtml を返す", () => {
    const payload = buildDraftEditPayload("page-1", "<p>ok</p><script>x</script>");
    expect(payload.pageId).toBe("page-1");
    expect(payload.bodyHtml).toContain("ok");
    expect(payload.bodyHtml).not.toContain("script");
  });
});

describe("countDraftCharacters", () => {
  it("空文字は 0", () => {
    expect(countDraftCharacters("")).toBe(0);
  });

  it("プレーンテキストの文字数を数える(日本語)", () => {
    expect(countDraftCharacters("あいうえお")).toBe(5);
  });

  it("前後の空白・改行を trim してから数える", () => {
    expect(countDraftCharacters("  \n本文\n  ")).toBe(2);
  });

  it("連続する空白・改行は 1 文字に畳んで数える(DetailPanel の換算と一致)", () => {
    // "本文" + 空白1 + "です" = 5 文字(改行/空白の連続は 1 に正規化)
    expect(countDraftCharacters("本文\n\n  です")).toBe(5);
  });

  it("空白のみは 0", () => {
    expect(countDraftCharacters("   \n\t  ")).toBe(0);
  });

  it("段落間の単一空白は 1 文字として数える", () => {
    expect(countDraftCharacters("a b c")).toBe(5);
  });
});

describe("classifyPreservedBlock", () => {
  it("data-pending 付き figure は img の有無に関わらず『生成中』に分類する", () => {
    const withImg = classifyPreservedBlock(
      '<figure data-pending="img-abcdef"><img src="/placeholder.png" alt=""></figure>'
    );
    const withoutImg = classifyPreservedBlock(
      '<figure class="body-image-pending" data-pending="img-abcdef"><figcaption>生成中</figcaption></figure>'
    );

    expect(withImg.kind).toBe("pending");
    expect(withImg.label).toBe("AI画像を生成中…（完了すると自動で差し替わります）");
    expect(withImg.hint).toBe("削除のみできます");
    expect(withoutImg.kind).toBe("pending");
  });

  it("figure > img は『画像』に分類する", () => {
    const c = classifyPreservedBlock('<figure><img src="/a.png" alt=""><figcaption>x</figcaption></figure>');
    expect(c.kind).toBe("image");
    expect(c.label).toBe("画像");
  });

  it("img を含まない figure は『図表』に分類する", () => {
    const c = classifyPreservedBlock("<figure><figcaption>グラフ</figcaption></figure>");
    expect(c.kind).toBe("figure");
    expect(c.label).toBe("図表");
  });

  it("table は『表』に分類する", () => {
    const c = classifyPreservedBlock("<table><tbody><tr><td>1</td></tr></tbody></table>");
    expect(c.kind).toBe("table");
    expect(c.label).toBe("表");
  });

  it("div.cta は『CTA』に分類する", () => {
    const c = classifyPreservedBlock('<div class="cta"><a href="#">予約</a></div>');
    expect(c.kind).toBe("cta");
    expect(c.label).toBe("CTA");
  });

  it("div.schedule は『スケジュール』に分類する", () => {
    const c = classifyPreservedBlock('<div class="schedule"><ol></ol></div>');
    expect(c.kind).toBe("schedule");
    expect(c.label).toBe("スケジュール");
  });

  it("a.embed は『埋め込み』に分類する", () => {
    const c = classifyPreservedBlock('<a class="embed" href="https://x.com/p">投稿</a>');
    expect(c.kind).toBe("embed");
    expect(c.label).toBe("埋め込み");
  });

  it("大文字タグ・属性順が違っても分類できる", () => {
    const c = classifyPreservedBlock('<TABLE class="x"><TR><TD>1</TD></TR></TABLE>');
    expect(c.kind).toBe("table");
  });

  it("判定できない/空の入力は『ブロック』にフォールバックする", () => {
    expect(classifyPreservedBlock("").kind).toBe("unknown");
    expect(classifyPreservedBlock("").label).toBe("ブロック");
    expect(classifyPreservedBlock("<span>x</span>").kind).toBe("unknown");
  });

  it("全種別に補足文(hint)がある", () => {
    const samples = [
      "<figure><img src=x></figure>",
      '<figure data-pending="img-abcdef"></figure>',
      "<table></table>",
      '<div class="cta"></div>',
      '<a class="embed"></a>',
      "",
    ];
    for (const html of samples) {
      expect(classifyPreservedBlock(html).hint.length).toBeGreaterThan(0);
    }
  });
});

describe("replaceImgSrcInHtml", () => {
  it("先頭 img の src 属性だけを差し替え、alt などは維持する", () => {
    const html = '<figure><img src="https://old.example/a.png" alt="説明" width="640"></figure>';
    const out = replaceImgSrcInHtml(html, "https://new.example/b.png");

    expect(out).toBe('<figure><img src="https://new.example/b.png" alt="説明" width="640"></figure>');
  });

  it("$1 を含む URL でも置換文字列展開を起こさない", () => {
    const html = '<figure><img src="https://old.example/a.png" alt="説明"></figure>';
    const out = replaceImgSrcInHtml(html, "https://new.example/$1.png");

    expect(out).toContain('src="https://new.example/$1.png"');
    expect(out).not.toContain("https://new.example/https://old.example");
  });

  it("img が無い HTML は原文を返す", () => {
    const html = "<figure><figcaption>画像待ち</figcaption></figure>";

    expect(replaceImgSrcInHtml(html, "https://new.example/b.png")).toBe(html);
  });
});

describe("DECORATION_OPTIONS", () => {
  it("装飾カタログ(key/label/kind)を提供する", () => {
    const keys = DECORATION_OPTIONS.map((d) => d.key);
    expect(keys).toEqual(["lead", "note", "caution", "highlight", "badge", "mark"]);
    expect(DECORATION_OPTIONS.every((d) => d.label.length > 0)).toBe(true);
    expect(DECORATION_OPTIONS.every((d) => ["block", "paragraph", "inline"].includes(d.kind))).toBe(
      true
    );
  });

  it("note/caution/highlight は #147 と同じ aside.<variant> の HTML 例にする", () => {
    const blocks = DECORATION_OPTIONS.filter((d) => d.kind === "block");
    for (const d of blocks) {
      expect(d.sampleHtml).toBe(`<aside class="${d.key}"><p>本文</p></aside>`);
    }
  });

  it("各装飾の HTML は STRICT サニタイズを往復しても消えない(保存後も残る)", () => {
    for (const d of DECORATION_OPTIONS) {
      const out = sanitizeDraftHtml(d.sampleHtml);
      if (d.kind === "block") {
        expect(out).toContain(`<aside class="${d.key}">`);
      } else if (d.key === "lead") {
        expect(out).toContain('class="lead"');
      } else if (d.key === "badge") {
        expect(out).toContain('class="badge"');
      } else if (d.key === "mark") {
        expect(out).toContain("<mark>");
      }
      expect(out).toContain("本文");
    }
  });
});
