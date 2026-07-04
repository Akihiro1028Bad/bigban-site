import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sanitizeNewsHtml,
  STRICT_HTML_CONFIG,
  RICH_EDITOR_CONFIG,
} from "./sanitize";

describe("sanitizeNewsHtml — 共通", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("script/iframe/style/base/link/form タグを除去", () => {
    const input = `
      <p>ok</p>
      <script>alert(1)</script>
      <iframe src="x"></iframe>
      <style>body{}</style>
      <base href="/">
      <link rel="stylesheet" href="x">
      <form action="x"><input></form>
    `;
    const out = sanitizeNewsHtml(input, STRICT_HTML_CONFIG);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<iframe/i);
    expect(out).not.toMatch(/<style/i);
    expect(out).not.toMatch(/<base/i);
    expect(out).not.toMatch(/<link/i);
    expect(out).not.toMatch(/<form/i);
    expect(out).toMatch(/<p>ok<\/p>/);
  });

  it("style属性 / on*属性 を除去", () => {
    const input = `<p style="color:red" onclick="bad()">ok</p>`;
    const out = sanitizeNewsHtml(input, STRICT_HTML_CONFIG);
    expect(out).not.toMatch(/style=/i);
    expect(out).not.toMatch(/onclick=/i);
  });

  it("javascript:/data: スキームの a@href を除去", () => {
    const input = `<a href="javascript:alert(1)">x</a><a href="data:text/html,<x>">y</a>`;
    const out = sanitizeNewsHtml(input, STRICT_HTML_CONFIG);
    expect(out).not.toMatch(/javascript:/i);
    expect(out).not.toMatch(/data:/i);
  });

  it("a に target=_blank / rel=noopener noreferrer 自動付与", () => {
    const out = sanitizeNewsHtml(
      `<a href="https://example.com">x</a>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/target="_blank"/);
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });

  it("img の許可外ホストは src 除去", () => {
    const out = sanitizeNewsHtml(
      `<img src="https://evil.example.com/x.jpg" alt="x">`,
      STRICT_HTML_CONFIG,
    );
    expect(out).not.toMatch(/src="https:\/\/evil/);
  });

  it("img の src が URL parse 失敗 (相対パス等) でも安全に除去", () => {
    const out = sanitizeNewsHtml(
      `<img src="not-a-valid-url" alt="x">`,
      STRICT_HTML_CONFIG,
    );
    expect(out).not.toMatch(/src="not-a-valid-url"/);
  });

  it("img の許可ホスト (images.microcms-assets.io) は src 保持", () => {
    const out = sanitizeNewsHtml(
      `<img src="https://images.microcms-assets.io/a.jpg" alt="x" width="10" height="10">`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/src="https:\/\/images\.microcms-assets\.io\/a\.jpg"/);
  });

  it("img width/height欠如時にデフォルト適用 + console.warn", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const out = sanitizeNewsHtml(
      `<img src="https://images.microcms-assets.io/x.jpg" alt="x">`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/width="1200"/);
    expect(out).toMatch(/height="675"/);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("img に loading=lazy / decoding=async が自動付与される", () => {
    const out = sanitizeNewsHtml(
      `<img src="https://images.microcms-assets.io/a.jpg" alt="x" width="10" height="10">`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/loading="lazy"/);
    expect(out).toMatch(/decoding="async"/);
  });

  it("isFirstImageLcp=true で先頭 img に fetchpriority=high + loading=eager", () => {
    const out = sanitizeNewsHtml(
      `<p>x</p><img src="https://images.microcms-assets.io/a.jpg" alt="x" width="10" height="10"><img src="https://images.microcms-assets.io/b.jpg" alt="y" width="10" height="10">`,
      STRICT_HTML_CONFIG,
      { isFirstImageLcp: true },
    );
    const firstImg = out.match(/<img[^>]*a\.jpg[^>]*>/);
    expect(firstImg).not.toBeNull();
    expect(firstImg?.[0]).toMatch(/fetchpriority="high"/);
    expect(firstImg?.[0]).toMatch(/loading="eager"/);
    const secondImg = out.match(/<img[^>]*b\.jpg[^>]*>/);
    expect(secondImg?.[0]).toMatch(/loading="lazy"/);
  });
});

describe("STRICT_HTML_CONFIG", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("許可タグ以外 (h1/section/div) を除去", () => {
    const out = sanitizeNewsHtml(
      `<h1>title</h1><section>x</section><div>y</div><p>ok</p>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).not.toMatch(/<h1/);
    expect(out).not.toMatch(/<section/);
    expect(out).not.toMatch(/<div/);
    expect(out).toMatch(/<p>ok<\/p>/);
  });

  it("許可クラス以外 (text-red-500) を除去、lead/caption は保持", () => {
    const out = sanitizeNewsHtml(
      `<p class="lead text-red-500">x</p><p class="caption">y</p>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/class="lead"/);
    expect(out).not.toMatch(/text-red-500/);
    expect(out).toMatch(/class="caption"/);
  });
});

describe("RICH_EDITOR_CONFIG", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("h2/h3/h4/p は保持されるが h1/section 等は除去される (記事 h1 は page側で出すため)", () => {
    const out = sanitizeNewsHtml(
      `<h1>title</h1><section>x</section><h2>sub</h2><p>ok</p>`,
      RICH_EDITOR_CONFIG,
    );
    expect(out).not.toMatch(/<h1/);
    expect(out).not.toMatch(/<section/);
    expect(out).toMatch(/<h2/);
    expect(out).toMatch(/<p>ok<\/p>/);
  });

  it("カスタムクラス lead/caption を保持", () => {
    const out = sanitizeNewsHtml(
      `<p class="lead">x</p><p class="caption">y</p>`,
      RICH_EDITOR_CONFIG,
    );
    expect(out).toMatch(/class="lead"/);
    expect(out).toMatch(/class="caption"/);
  });

  it("RICH モードでも任意の class は除去される (Tailwind ユーティリティで clickjacking 等を防止)", () => {
    const out = sanitizeNewsHtml(
      `<aside class="note fixed inset-0 z-50">x</aside>`,
      RICH_EDITOR_CONFIG,
    );
    expect(out).toMatch(/class="note"/);
    expect(out).not.toMatch(/fixed/);
    expect(out).not.toMatch(/inset-0/);
    expect(out).not.toMatch(/z-50/);
  });
});

describe("Table 系タグ", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("table/thead/tbody/tr/th/td/caption が許可される", () => {
    const input = `
      <table>
        <caption>料金表</caption>
        <thead><tr><th scope="col">プラン</th><th scope="col">価格</th></tr></thead>
        <tbody><tr><td>Standard</td><td>2,750円</td></tr></tbody>
      </table>
    `;
    const out = sanitizeNewsHtml(input, STRICT_HTML_CONFIG);
    expect(out).toMatch(/<table/);
    expect(out).toMatch(/<caption>料金表<\/caption>/);
    expect(out).toMatch(/<th[^>]*scope="col"/);
    expect(out).toMatch(/<td>Standard<\/td>/);
  });

  it("th scope の不正値は除去 (enum 検証)", () => {
    const out = sanitizeNewsHtml(
      `<table><tr><th scope="javascript:alert(1)">X</th></tr></table>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<th>X<\/th>/);
    expect(out).not.toMatch(/scope=/);
  });

  it("colspan の DoS 値 (大きすぎる数字) は除去", () => {
    const out = sanitizeNewsHtml(
      `<table><tr><td colspan="999999999">X</td></tr></table>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<td>X<\/td>/);
    expect(out).not.toMatch(/colspan=/);
  });

  it("colspan の正常値 (1-99) は保持", () => {
    const out = sanitizeNewsHtml(
      `<table><tr><td colspan="2">X</td><td rowspan="3">Y</td></tr></table>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/colspan="2"/);
    expect(out).toMatch(/rowspan="3"/);
  });

  it("table 内に script があれば除去", () => {
    const out = sanitizeNewsHtml(
      `<table><script>alert(1)</script><tr><td>X</td></tr></table>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).not.toMatch(/<script/);
    expect(out).toMatch(/<td>X<\/td>/);
  });
});

describe("Badge / Note / Mark 等のカスタム要素", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("span class=badge / class=highlight が許可される", () => {
    const out = sanitizeNewsHtml(
      `<p>レベル: <span class="badge">中級</span> <span class="highlight">重要</span></p>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<span class="badge">中級<\/span>/);
    expect(out).toMatch(/<span class="highlight">重要<\/span>/);
  });

  it("aside class=note / class=caution が許可される", () => {
    const out = sanitizeNewsHtml(
      `<aside class="note">注意1</aside><aside class="caution">注意2</aside>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<aside class="note">注意1<\/aside>/);
    expect(out).toMatch(/<aside class="caution">注意2<\/aside>/);
  });

  it("aside class=danger 等の許可外クラスは除去", () => {
    const out = sanitizeNewsHtml(
      `<aside class="danger">x</aside>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<aside>x<\/aside>/);
    expect(out).not.toMatch(/danger/);
  });

  it("mark タグが許可される", () => {
    const out = sanitizeNewsHtml(
      `<p><mark>強調</mark></p>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<mark>強調<\/mark>/);
  });

  it("mark の on* 属性は除去", () => {
    const out = sanitizeNewsHtml(
      `<p><mark onmouseover="alert(1)">x</mark></p>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<mark>x<\/mark>/);
    expect(out).not.toMatch(/onmouseover/);
  });

  it("class が複数指定された場合、許可されたものだけ残る", () => {
    const out = sanitizeNewsHtml(
      `<aside class="note danger evil">x</aside>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<aside class="note">x<\/aside>/);
  });
});

describe("CTA / Schedule timeline / time 要素", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("a class=cta が許可される + 自動 target/rel 補完", () => {
    const out = sanitizeNewsHtml(
      `<a href="https://example.com" class="cta">申し込む</a>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<a [^>]*class="cta"/);
    expect(out).toMatch(/target="_blank"/);
    expect(out).toMatch(/rel="noopener noreferrer"/);
  });

  it("cta--ghost (二次CTA) も許可される", () => {
    const out = sanitizeNewsHtml(
      `<a href="https://example.com" class="cta cta--ghost">詳細</a>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/class="cta cta--ghost"/);
  });

  it("schedule / schedule-item クラスが許可される", () => {
    const out = sanitizeNewsHtml(
      `<ol class="schedule"><li class="schedule-item"><time datetime="2026-04-29">04/29</time><h3>X</h3></li></ol>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<ol class="schedule">/);
    expect(out).toMatch(/<li class="schedule-item">/);
    expect(out).toMatch(/<time datetime="2026-04-29">04\/29<\/time>/);
  });

  it("time 要素が単独でも使える (datetime 任意)", () => {
    const out = sanitizeNewsHtml(
      `<p>開催: <time>2026年5月2日</time></p>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<time>2026年5月2日<\/time>/);
  });

  it("datetime 不正値は除去 (XSS 防御)", () => {
    const out = sanitizeNewsHtml(
      `<time datetime="javascript:alert(1)">x</time>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<time>x<\/time>/);
    expect(out).not.toMatch(/datetime/);
  });

  it("datetime は ISO 8601 形式のみ許可 (フォーマット違反は除去)", () => {
    const out = sanitizeNewsHtml(
      `<time datetime="2026年04月29日">x</time>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<time>x<\/time>/);
    expect(out).not.toMatch(/datetime/);
  });

  it("datetime ISO 形式 (年月日 + 時刻 + タイムゾーン) は許可", () => {
    const out = sanitizeNewsHtml(
      `<time datetime="2026-04-29T10:00:00+09:00">x</time>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/datetime="2026-04-29T10:00:00\+09:00"/);
  });

  it("datetime は <time> 以外では除去 (スコープ制限)", () => {
    const out = sanitizeNewsHtml(
      `<p datetime="2026-04-29">x</p>`,
      STRICT_HTML_CONFIG,
    );
    expect(out).toMatch(/<p>x<\/p>/);
    expect(out).not.toMatch(/datetime/);
  });

  describe("SNS 埋め込みトークン (<a class='embed' data-embed-*>)", () => {
    it("登録済プロバイダ + 形式適合 ID は data-embed-* を保持", () => {
      const out = sanitizeNewsHtml(
        `<a class="embed" data-embed-provider="youtube" data-embed-id="dQw4w9WgXcQ">YouTube で見る</a>`,
        STRICT_HTML_CONFIG,
      );
      expect(out).toMatch(/data-embed-provider="youtube"/);
      expect(out).toMatch(/data-embed-id="dQw4w9WgXcQ"/);
      expect(out).toMatch(/class="embed"/);
    });

    it("属性順序が異なっても保持", () => {
      const out = sanitizeNewsHtml(
        `<a data-embed-id="dQw4w9WgXcQ" data-embed-provider="youtube" class="embed">x</a>`,
        STRICT_HTML_CONFIG,
      );
      expect(out).toMatch(/data-embed-provider="youtube"/);
      expect(out).toMatch(/data-embed-id="dQw4w9WgXcQ"/);
    });

    it("未登録プロバイダ (vimeo) の data-embed-provider は除去", () => {
      const out = sanitizeNewsHtml(
        `<a class="embed" data-embed-provider="vimeo" data-embed-id="123456789">x</a>`,
        STRICT_HTML_CONFIG,
      );
      expect(out).not.toMatch(/data-embed-provider/);
    });

    it("プロバイダ名が空 / 大文字 / 不正文字なら除去", () => {
      const cases = ["", "YOUTUBE", "you tube", "yt!"];
      for (const v of cases) {
        const out = sanitizeNewsHtml(
          `<a class="embed" data-embed-provider="${v}" data-embed-id="dQw4w9WgXcQ">x</a>`,
          STRICT_HTML_CONFIG,
        );
        expect(out).not.toMatch(/data-embed-provider/);
      }
    });

    it("data-embed-id の一般形式違反 (空 / 長すぎ / 特殊文字) は除去", () => {
      const cases = [
        "",
        "a".repeat(65),
        "id with space",
        "id'with-quote",
        "<script>",
        'id"quote',
      ];
      for (const v of cases) {
        const input = `<a class="embed" data-embed-provider="youtube" data-embed-id="${v.replace(/"/g, "&quot;")}">x</a>`;
        const out = sanitizeNewsHtml(input, STRICT_HTML_CONFIG);
        expect(out).not.toMatch(/data-embed-id="(?!dQw)/);
      }
    });

    it("class='embed' は filterClasses を通過する", () => {
      const out = sanitizeNewsHtml(
        `<a class="embed" data-embed-provider="youtube" data-embed-id="dQw4w9WgXcQ">x</a>`,
        STRICT_HTML_CONFIG,
      );
      expect(out).toMatch(/class="embed"/);
    });

    it("RICH_EDITOR_CONFIG でも同じ挙動", () => {
      const out = sanitizeNewsHtml(
        `<a class="embed" data-embed-provider="youtube" data-embed-id="dQw4w9WgXcQ">x</a>`,
        RICH_EDITOR_CONFIG,
      );
      expect(out).toMatch(/data-embed-provider="youtube"/);
      expect(out).toMatch(/data-embed-id="dQw4w9WgXcQ"/);
    });

    it("data-embed-* は <a> 以外では除去 (スコープ制限)", () => {
      const out = sanitizeNewsHtml(
        `<p class="embed" data-embed-provider="youtube" data-embed-id="dQw4w9WgXcQ">x</p>`,
        STRICT_HTML_CONFIG,
      );
      expect(out).not.toMatch(/data-embed-provider/);
      expect(out).not.toMatch(/data-embed-id/);
    });
  });

  describe("本文画像生成プレースホルダ (<figure data-pending>)", () => {
    it("figure の正規 data-pending は STRICT_HTML_CONFIG で保持", () => {
      const out = sanitizeNewsHtml(
        `<figure data-pending="img-abc123"><figcaption>生成中</figcaption></figure>`,
        STRICT_HTML_CONFIG,
      );
      expect(out).toMatch(/<figure data-pending="img-abc123">/);
    });

    it("不正形式の data-pending は除去", () => {
      const cases = ["x-1", `img-${"a".repeat(65)}`, "img-abc123!"];
      for (const v of cases) {
        const out = sanitizeNewsHtml(
          `<figure data-pending="${v}"><figcaption>生成中</figcaption></figure>`,
          STRICT_HTML_CONFIG,
        );
        expect(out).not.toMatch(/data-pending/);
        expect(out).toMatch(/<figure><figcaption>生成中<\/figcaption><\/figure>/);
      }
    });

    it("figure 以外の data-pending は除去", () => {
      const out = sanitizeNewsHtml(
        `<div data-pending="img-abc123">生成中</div><p data-pending="img-def456">本文</p>`,
        STRICT_HTML_CONFIG,
      );
      expect(out).not.toMatch(/data-pending/);
      expect(out).toMatch(/生成中/);
      expect(out).toMatch(/<p>本文<\/p>/);
    });

    it("data-pending 付き figure の figcaption は保持", () => {
      const out = sanitizeNewsHtml(
        `<figure data-pending="img-abc123"><figcaption>画像を生成しています</figcaption></figure>`,
        STRICT_HTML_CONFIG,
      );
      expect(out).toMatch(
        /<figure data-pending="img-abc123"><figcaption>画像を生成しています<\/figcaption><\/figure>/,
      );
    });

    it("RICH_EDITOR_CONFIG でも同じ挙動", () => {
      const valid = sanitizeNewsHtml(
        `<figure data-pending="img-abc123"><figcaption>生成中</figcaption></figure>`,
        RICH_EDITOR_CONFIG,
      );
      expect(valid).toMatch(/data-pending="img-abc123"/);

      const invalid = sanitizeNewsHtml(
        `<figure data-pending="img-abc123!"><figcaption>生成中</figcaption></figure>`,
        RICH_EDITOR_CONFIG,
      );
      expect(invalid).not.toMatch(/data-pending/);
    });
  });
});
