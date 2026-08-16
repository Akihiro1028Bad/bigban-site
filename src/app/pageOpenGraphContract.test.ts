import { describe, it, expect } from "vitest";
import { existsSync, globSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

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
 *
 * ⚠️ これは AST 解析ではなく正規表現による近似チェックである。
 * 精度と網羅性は両立しないため、**偽陽性側に倒す**方針を採る
 * (通ってしまうより、無関係な記述で落ちて人が見直す方が安い)。
 * 例えば twitter の検査はコメントや無関係なデータにも反応しうるが、
 * 落ちたときのメッセージから対象ファイルは分かる。
 * 逆に、狙って回避する書き方 (動的な代入など) までは防げない。
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

/**
 * ページ側で twitter に触れていれば true。
 * 右辺の形は問わない。`twitter: tw` のような変数経由を見逃すと、
 * twitter:image の og:image 追従が静かに壊れるため。
 * ページが twitter に触れる正当な理由は現状ないので、広めに倒す。
 */
function hasPageTwitter(src: string): boolean {
  return /twitter\s*[:=]/.test(src);
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

  it("twitter はプロパティ形・代入形・変数経由をすべて検出する", () => {
    expect(hasPageTwitter("  twitter: { card: 'x' },")).toBe(true);
    expect(hasPageTwitter("  meta.twitter = { card: 'x' };")).toBe(true);
    // 変数経由を見逃すと twitter:image の追従が静かに壊れる。
    expect(hasPageTwitter("  twitter: tw,")).toBe(true);
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
      // 関数宣言形と const 代入形の両方を拾う。
      const declaresMetadata =
        /export (?:async )?function generateMetadata/.test(src) ||
        /export const generateMetadata\s*[:=]/.test(src);
      return declaresMetadata && !hasHelperOpenGraph(src);
    });
    expect(missing).toEqual([]);
  });

  it("shouldUseFileImage を使うページは同じ階層に opengraph-image を持つ", () => {
    // shouldUseFileImage は images キーを落として Next のファイル規約に
    // 委ねる指定。規約ファイルが無いと og:image / twitter:image が
    // 丸ごと消えるが、ヘルパ単体では検出できないためここで担保する。
    // ルートに [locale] / [slug] を含むため glob は使えない
    // (ブラケットが文字クラスとして解釈される)。存在確認で判定する。
    const OG_IMAGE_FILES = [
      "opengraph-image.tsx",
      "opengraph-image.ts",
      "opengraph-image.jsx",
      "opengraph-image.js",
      "opengraph-image.png",
      "opengraph-image.jpg",
    ];
    const broken = PAGE_FILES.filter((file) => {
      if (!readPage(file).includes("shouldUseFileImage")) return false;
      const dir = dirname(file);
      return !OG_IMAGE_FILES.some((name) => existsSync(join(dir, name)));
    });
    expect(broken).toEqual([]);
  });

  it("ページ側で twitter を設定しない", () => {
    // layout は twitter.images を意図的に未指定にしている (og:image への
    // 自動追従を止めないため)。ページ側で設定すると layout ごと置換される。
    expect(PAGE_FILES.filter((f) => hasPageTwitter(readPage(f)))).toEqual([]);
  });
});
