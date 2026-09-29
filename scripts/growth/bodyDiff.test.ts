import { describe, it, expect } from "vitest";

import { diffBodies, formatReport, toBodyRoot } from "./bodyDiff";

const IMG = "https://images.microcms-assets.io/assets/x";

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function root(html: string): ParentNode {
  return toBodyRoot(html, parse);
}

function live(bodyHtml: string): string {
  return `<nav><a href="https://www.thepicklebang.com/reserve">予約</a></nav><div data-testid="news-body">${bodyHtml}</div>`;
}

function diff(oldHtml: string, newHtml: string) {
  return diffBodies(root(oldHtml), root(newHtml));
}

describe("toBodyRoot", () => {
  it("公開ページなら news-body の中だけを対象にする(ヘッダー等のリンクを拾わない)", () => {
    const result = diff(live('<p><a href="https://www.thepicklebang.com/ja/news/a">本文リンク</a></p>'), "");
    expect(result.missing.links.map((l) => l.href)).toEqual(["/ja/news/a"]);
  });

  it("本文の断片はサイトと同じサニタイザを通してから比べる(表示されない相対リンクは消えた扱い)", () => {
    const result = diff(
      live('<p><a href="https://www.thepicklebang.com/ja/reserve">予約</a></p>'),
      '<p><a href="/ja/reserve">予約</a></p>',
    );
    expect(result.missing.links).toEqual([{ href: "/ja/reserve", text: "予約", isCta: false }]);
  });

  it("本文の断片に生の iframe を書いてもサニタイザで消えるので、埋め込みが消えた扱いになる", () => {
    const result = diff(
      live('<iframe src="https://www.youtube-nocookie.com/embed/abc123?rel=0"></iframe>'),
      '<iframe src="https://www.youtube.com/embed/abc123"></iframe>',
    );
    expect(result.missing.embeds).toEqual(["youtube:abc123"]);
  });

  it("公開ページを必須にした入力に本文コンテナが無ければエラーにする", () => {
    expect(() => toBodyRoot("<main>記事がありません</main>", parse, { requireContainer: true })).toThrow(
      "記事本文(news-body)が見つかりません",
    );
    expect(toBodyRoot(live("<p>x</p>"), parse, { requireContainer: true })).toBeDefined();
  });
});

describe("diffBodies", () => {
  it("同じ本文なら消えた要素は0件", () => {
    const html = '<h2>見出し</h2><p><a href="https://example.com/a">x</a></p><table><tr><th>料金</th></tr></table>';
    expect(diff(html, html).missingCount).toBe(0);
  });

  it("消えたリンクをアンカーテキスト付きで返す。サイト内の絶対 URL はパスに、末尾スラッシュは外部 URL も含めて揃える", () => {
    const result = diff(
      live(
        '<p><a href="https://www.thepicklebang.com/ja/news/a/">体験会</a><a href="https://labola.jp/r/1/">予約</a><a href="https://www.thepicklebang.com/ja/columns/b">千葉</a></p>',
      ),
      '<p><a href="https://www.thepicklebang.com/ja/news/a">体験会はこちら</a><a href="https://labola.jp/r/1">予約</a></p>',
    );
    expect(result.missing.links).toEqual([{ href: "/ja/columns/b", text: "千葉", isCta: false }]);
  });

  it("ページ内リンク(#)と mailto / tel もそのまま照合する", () => {
    const result = diff(
      '<p><a href="#faq">よくある質問</a><a href="mailto:info@example.com">メール</a><a href="tel:0000">電話</a></p>',
      '<p><a href="mailto:info@example.com">メール</a></p>',
    );
    expect(result.missing.links.map((l) => l.href)).toEqual(["#faq", "tel:0000"]);
  });

  it("予約・申込ボタン(cta クラス)が消えたら CTA として印を付ける", () => {
    const result = diff('<p><a class="cta--ghost" href="https://labola.jp/r/1">申し込む</a></p>', "<p>終了しました</p>");
    expect(result.missing.links).toEqual([{ href: "https://labola.jp/r/1", text: "申し込む", isCta: true }]);
  });

  it("ボタンが同じ URL の普通のリンクに格下げされたら、CTA が消えた扱いにする", () => {
    const result = diff(
      '<p><a class="cta" href="https://labola.jp/r/1">予約する</a> または <a href="https://labola.jp/r/1">こちら</a></p>',
      '<p><a href="https://labola.jp/r/1">こちら</a></p>',
    );
    expect(result.missing.links).toEqual([{ href: "https://labola.jp/r/1", text: "予約する", isCta: true }]);
  });

  it("画像はクエリ(最適化パラメータ)を無視して src で照合し、消えたものを alt 付きで返す", () => {
    const result = diff(
      live(`<img src="${IMG}/court.jpg?w=1200&fm=webp" alt="コート"><img src="${IMG}/map.png" alt="地図">`),
      `<img src="${IMG}/court.jpg" alt="コート全景">`,
    );
    expect(result.missing.images).toEqual([{ src: `${IMG}/map.png`, alt: "地図" }]);
  });

  it("消えた見出し(h2/h3)を返す。前後の空白の違いは無視する", () => {
    const result = diff("<h2> 料金 </h2><h3>船橋市</h3><h3>市川市</h3>", "<h2>料金</h2><h3>船橋市</h3>");
    expect(result.missing.headings).toEqual([{ level: 3, text: "市川市" }]);
  });

  it("表は見出し行(thead または1行目)のテキストで照合し、消えた表を返す", () => {
    const result = diff(
      "<table><tr><th>区分</th><th>料金</th></tr></table><table><thead><tr><th>大会</th><th>日程</th></tr></thead></table>",
      "<table><tr><th>区分</th><th>料金</th></tr><tr><td>一般</td><td>—</td></tr></table>",
    );
    expect(result.missing.tables).toEqual(["大会 / 日程"]);
  });

  it("行見出し(th)の文言を変えても表そのものは消えた扱いにしない", () => {
    const result = diff(
      "<table><thead><tr><th>区分</th><th>料金</th></tr></thead><tbody><tr><th>一般</th><td>—</td></tr></tbody></table>",
      "<table><thead><tr><th>区分</th><th>料金</th></tr></thead><tbody><tr><th>一般(平日)</th><td>—</td></tr></tbody></table>",
    );
    expect(result.missingCount).toBe(0);
  });

  it("見出し行の無い表は1行目のセルで照合する", () => {
    const result = diff("<table><tr><td>A</td><td>B</td></tr></table>", "<p>表を削除</p>");
    expect(result.missing.tables).toEqual(["A / B"]);
  });

  it("行の無い表は空のキーで照合する", () => {
    expect(diff("<table></table>", "").missing.tables).toEqual([""]);
  });

  it("同じ表が2つあって1つ消えたら1件として返す", () => {
    const table = "<table><tr><th>X</th></tr></table>";
    expect(diff(table + table, table).missing.tables).toEqual(["X"]);
  });

  it("埋め込みトークンと公開ページの iframe を同じ動画として照合し、埋め込みの代替リンクはリンクに数えない", () => {
    const token = '<a class="embed" data-embed-provider="youtube" data-embed-id="abc123"></a>';
    const liveEmbed = live(
      '<figure data-testid="embed-shell"><iframe src="https://www.youtube-nocookie.com/embed/abc123?rel=0"></iframe><a href="https://www.youtube.com/watch?v=abc123">YouTubeで見る</a></figure>',
    );
    expect(diff(liveEmbed, token).missingCount).toBe(0);
    expect(diff(token, "<p>動画なし</p>").missing.embeds).toEqual(["youtube:abc123"]);
  });

  it("Instagram の iframe も投稿 ID で照合する", () => {
    const liveEmbed = live('<iframe src="https://www.instagram.com/p/XyZ_9/embed"></iframe>');
    const token = '<a class="embed" data-embed-provider="instagram" data-embed-id="XyZ_9"></a>';
    expect(diff(liveEmbed, token).missingCount).toBe(0);
  });

  it("未知の iframe は src(クエリ除く)で照合する", () => {
    const result = diff(live('<iframe src="https://maps.example.com/embed?q=1"></iframe>'), "");
    expect(result.missing.embeds).toEqual(["https://maps.example.com/embed"]);
  });

  it("注記ボックス(note / caution)は種類ごとの個数が減ったら返す", () => {
    const result = diff(
      live('<aside class="note">a</aside><aside class="caution">b</aside><aside class="caution">c</aside><aside>d</aside>'),
      '<aside class="caution">b</aside>',
    );
    expect(result.missing.asides).toEqual([
      { kind: "note", before: 1, after: 0 },
      { kind: "caution", before: 2, after: 1 },
      { kind: "other", before: 1, after: 0 },
    ]);
  });

  it("増えた要素は件数だけ返す", () => {
    const result = diff("<p>x</p>", `<h2>新</h2><p><a href="https://example.com/a">a</a></p><img src="${IMG}/i.png" alt="">`);
    expect(result.added).toEqual({ links: 1, images: 1, headings: 1, tables: 0, embeds: 0 });
  });

  it("href の無いリンク、src の無い画像・iframe、ID の無い埋め込みトークンは無視する", () => {
    const result = diff(
      live('<a>名前だけ</a><img alt="x"><iframe></iframe><a class="embed" data-embed-provider="youtube"></a>'),
      "",
    );
    expect(result.missingCount).toBe(0);
  });
});

describe("formatReport", () => {
  it("消えた要素が無ければその旨を1行で返す", () => {
    const html = "<p>x</p>";
    expect(formatReport(diff(html, html))).toBe("消えた要素はありません。\n");
  });

  it("消えた要素を種類ごとに列挙し、CTA には印を付ける", () => {
    const report = formatReport(
      diff(
        `<h2>料金</h2><p><a class="cta" href="https://labola.jp/r/1">予約する</a><a href="https://example.com/a">体験会</a></p><img src="${IMG}/m.png" alt="地図"><table><tr><th>区分</th></tr></table><a class="embed" data-embed-provider="youtube" data-embed-id="v1"></a><aside class="note">n</aside>`,
        "<p>全部消えた</p>",
      ),
    );
    expect(report).toContain("消えた要素: 7件");
    expect(report).toContain("- [CTA] 予約する → https://labola.jp/r/1");
    expect(report).toContain("- 体験会 → https://example.com/a");
    expect(report).toContain("- h2 料金");
    expect(report).toContain(`- 地図 (${IMG}/m.png)`);
    expect(report).toContain("- 区分");
    expect(report).toContain("- youtube:v1");
    expect(report).toContain("- note: 1 → 0");
  });

  it("alt もアンカーテキストも空なら(なし)と表示し、増えた要素の件数を末尾に付ける", () => {
    const report = formatReport(diff(`<a href="https://example.com/x"></a><img src="${IMG}/y.png">`, "<h2>新</h2>"));
    expect(report).toContain("- (なし) → https://example.com/x");
    expect(report).toContain(`- (なし) (${IMG}/y.png)`);
    expect(report).toContain("増えた要素: リンク0 / 画像0 / 見出し1 / 表0 / 埋め込み0");
  });
});
