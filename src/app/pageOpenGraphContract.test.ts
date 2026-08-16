import { describe, it, expect } from "vitest";
import { globSync, readFileSync } from "node:fs";

/**
 * ページ側 openGraph の規約テスト。
 *
 * Next はページの openGraph を layout の openGraph と置換するため、ページごとに
 * 手書きすると og:type / og:site_name の取りこぼしが起きる。実際に 8 ページで
 * 同じ欠落が発生していた (#425 のレビューで発覚)。
 *
 * ソースを直接検査することで、**将来追加されるページも自動的に対象**になる。
 * 個別ページのモックが不要で、規約違反をレビュー前に落とせる。
 * openGraph 自体の中身は pageOpenGraph.test.ts で検証する。
 */
const PAGE_FILES = globSync("src/app/**/page.tsx").sort();

/**
 * `openGraph:` / `meta.openGraph =` の右辺の先頭トークンを拾う。
 * 先読みだけで書くと `\s*` のバックトラックで素通りするため、
 * 右辺を捕捉して明示的に判定する。
 */
const OPEN_GRAPH_ASSIGNMENT = /openGraph\s*[:=]\s*([A-Za-z_$][\w$]*\s*\(|\{)/g;

const HELPER = "buildPageOpenGraph";

/**
 * openGraph 代入の右辺を正規化して返す。
 * 関数呼び出しなら関数名、オブジェクトリテラルなら "{"。
 */
function openGraphAssignments(src: string): string[] {
  return [...src.matchAll(OPEN_GRAPH_ASSIGNMENT)].map((m) =>
    m[1].replace(/\s*\($/, ""),
  );
}

/** ヘルパを通さず openGraph を組み立てていれば true。 */
function hasDirectOpenGraph(src: string): boolean {
  // 前方一致だと buildPageOpenGraphLegacy などを取り逃がすため完全一致で見る。
  return openGraphAssignments(src).some((value) => value !== HELPER);
}

/** ヘルパの戻り値を実際に openGraph へ入れていれば true。 */
function hasHelperOpenGraph(src: string): boolean {
  // import 行だけで通らないよう、代入の右辺そのものを見る。
  return openGraphAssignments(src).some((value) => value === HELPER);
}

/** ページ側で twitter を組み立てていれば true。 */
function hasPageTwitter(src: string): boolean {
  return /twitter\s*[:=]\s*\{/.test(src);
}

function readPage(file: string): string {
  return readFileSync(file, "utf-8");
}

describe("規約チェッカ自体の検出力", () => {
  // 検出できない正規表現は無害に見えて全ページを素通りさせる。
  // 実際に一度そのバグを踏んだため、検出側にもテストを置く。
  it("プロパティ形の直書きを検出する", () => {
    expect(hasDirectOpenGraph("  openGraph: {\n    type: 'website',\n  },")).toBe(
      true,
    );
  });

  it("代入形の直書きを検出する", () => {
    expect(hasDirectOpenGraph("  meta.openGraph = { url };")).toBe(true);
  });

  it("別関数の戻り値を入れる形も検出する", () => {
    expect(hasDirectOpenGraph("  openGraph: buildSomethingElse({}),")).toBe(
      true,
    );
  });

  it("buildPageOpenGraph 経由は検出しない", () => {
    expect(hasDirectOpenGraph("  openGraph: buildPageOpenGraph({ url }),")).toBe(
      false,
    );
    expect(
      hasDirectOpenGraph("  meta.openGraph = buildPageOpenGraph({ url });"),
    ).toBe(false);
  });

  it("名前が前方一致するだけの別関数は検出する", () => {
    expect(
      hasDirectOpenGraph("  openGraph: buildPageOpenGraphLegacy({ url }),"),
    ).toBe(true);
  });

  it("import しただけで openGraph に入れていなければ使用とみなさない", () => {
    const importOnly =
      'import { buildPageOpenGraph } from "@/lib/metadata/pageOpenGraph";\n' +
      "export async function generateMetadata() {\n  return { title: 'T' };\n}";
    expect(hasHelperOpenGraph(importOnly)).toBe(false);
    expect(
      hasHelperOpenGraph("  openGraph: buildPageOpenGraph({ url }),"),
    ).toBe(true);
  });

  it("twitter はプロパティ形・代入形の両方を検出する", () => {
    expect(hasPageTwitter("  twitter: { card: 'x' },")).toBe(true);
    expect(hasPageTwitter("  meta.twitter = { card: 'x' };")).toBe(true);
    expect(hasPageTwitter("const TWITTER_URL = 'https://x.com';")).toBe(false);
  });
});

describe("ページ側 openGraph の規約", () => {
  it("検査対象のページが存在する (glob が空振りしていない)", () => {
    expect(PAGE_FILES.length).toBeGreaterThan(0);
  });

  it("openGraph は必ず buildPageOpenGraph の戻り値を入れる", () => {
    // 直接書くと type / siteName の再指定漏れと、title 明示による
    // og:title のブランド名落ちが再発する。
    expect(PAGE_FILES.filter((f) => hasDirectOpenGraph(readPage(f)))).toEqual(
      [],
    );
  });

  it("generateMetadata を持つページは buildPageOpenGraph で openGraph を出す", () => {
    // 「直接書かない」だけだと openGraph を一切出さないページを見逃す。
    // その場合 layout の og には url が無いため og:url が欠落する。
    const missing = PAGE_FILES.filter((file) => {
      const src = readPage(file);
      return (
        /export (?:async )?function generateMetadata/.test(src) &&
        !hasHelperOpenGraph(src)
      );
    });
    expect(missing).toEqual([]);
  });

  it("ページ側で twitter を設定しない", () => {
    // layout は twitter.images を意図的に未指定にしている (og:image への
    // 自動追従を止めないため)。ページ側で設定すると layout ごと置換される。
    expect(PAGE_FILES.filter((f) => hasPageTwitter(readPage(f)))).toEqual([]);
  });
});
