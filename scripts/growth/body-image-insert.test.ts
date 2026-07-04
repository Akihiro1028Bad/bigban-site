// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  PLACEHOLDER_ID_RE,
  bodyImageFigureHtml,
  buildPendingFigureHtml,
  extractBodyHeadings,
  insertHtmlAfterHeading,
  isPlaceholderId,
} from "./body-image-insert";

describe("PLACEHOLDER_ID_RE", () => {
  it("placeholder ID の正規形を表す", () => {
    expect("img-abc123").toMatch(PLACEHOLDER_ID_RE);
    expect("img-abcdef").toMatch(PLACEHOLDER_ID_RE);
    expect("img-abc!23").not.toMatch(PLACEHOLDER_ID_RE);
  });
});

describe("isPlaceholderId", () => {
  it("正規 ID のみ true", () => {
    expect(isPlaceholderId("img-abc123")).toBe(true);
    expect(isPlaceholderId("img-12345")).toBe(false);
    expect(isPlaceholderId("img-abc!23")).toBe(false);
    expect(isPlaceholderId(123)).toBe(false);
  });
});

describe("buildPendingFigureHtml", () => {
  it("正規 ID から pending figure を返す", () => {
    expect(buildPendingFigureHtml("img-abc123")).toBe(
      `<figure data-pending="img-abc123"><figcaption>AI画像を生成中…（完了すると自動で差し替わります）</figcaption></figure>`
    );
  });

  it("不正 ID は空文字を返す", () => {
    expect(buildPendingFigureHtml("img-abc!23")).toBe("");
  });
});

describe("bodyImageFigureHtml", () => {
  it("substituteBodyImages と同じ figure/img 形を返し属性値をエスケープする", () => {
    expect(bodyImageFigureHtml("https://images.microcms-assets.io/assets/a&b.png", `図 "A"`)).toBe(
      `<figure><img src="https://images.microcms-assets.io/assets/a&amp;b.png" alt="図 &quot;A&quot;"></figure>`
    );
  });
});

describe("extractBodyHeadings", () => {
  it("h2 を出現順に index 付きで返す", () => {
    const html = `<h2>最初</h2><p>本文</p><h2>次</h2><h3>細目</h3><h2>最後</h2>`;
    expect(extractBodyHeadings(html)).toEqual([
      { text: "最初", index: 0 },
      { text: "次", index: 1 },
      { text: "最後", index: 2 },
    ]);
  });

  it("h2 が無ければ空配列", () => {
    expect(extractBodyHeadings("<p>本文</p><h3>小見出し</h3>")).toEqual([]);
  });

  it("h2 内の装飾タグを除去して text にする", () => {
    expect(extractBodyHeadings(`<h2><span>市川</span>で<strong>始める</strong></h2>`)).toEqual([
      { text: "市川で始める", index: 0 },
    ]);
  });
});

describe("insertHtmlAfterHeading", () => {
  const fragment = `<figure data-pending="img-abc123"></figure>`;

  it("先頭 h2 セクションの直後、つまり次 h2 の直前に挿入する", () => {
    const html = `<h2>一</h2><p>A</p><h2>二</h2><p>B</p>`;
    expect(insertHtmlAfterHeading(html, 0, fragment)).toBe(
      `<h2>一</h2><p>A</p>${fragment}<h2>二</h2><p>B</p>`
    );
  });

  it("最後の h2 は本文末尾へ挿入する", () => {
    const html = `<h2>一</h2><p>A</p><h2>二</h2><p>B</p>`;
    expect(insertHtmlAfterHeading(html, 1, fragment)).toBe(
      `<h2>一</h2><p>A</p><h2>二</h2><p>B</p>${fragment}`
    );
  });

  it("headingIndex=null は本文末尾へ追加する", () => {
    expect(insertHtmlAfterHeading("<p>本文</p>", null, fragment)).toBe(`<p>本文</p>${fragment}`);
  });

  it("範囲外 index は本文末尾へフォールバックする", () => {
    const html = `<h2>一</h2><p>A</p>`;
    expect(insertHtmlAfterHeading(html, 99, fragment)).toBe(`${html}${fragment}`);
  });
});
