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

function pagesMatching(pattern: RegExp): string[] {
  return PAGE_FILES.filter((file) => pattern.test(readFileSync(file, "utf-8")));
}

describe("ページ側 openGraph の規約", () => {
  it("検査対象のページが存在する (glob が空振りしていない)", () => {
    expect(PAGE_FILES.length).toBeGreaterThan(0);
  });

  it("openGraph をページで直接組み立てない (buildPageOpenGraph を使う)", () => {
    // 直接書くと type / siteName の再指定漏れと、title 明示による
    // og:title のブランド名落ちが再発する。
    expect(pagesMatching(/^\s+openGraph: \{/m)).toEqual([]);
  });

  it("ページ側で twitter を設定しない", () => {
    // layout は twitter.images を意図的に未指定にしている (og:image への
    // 自動追従を止めないため)。ページ側で設定すると layout ごと置換される。
    expect(pagesMatching(/^\s+twitter: \{/m)).toEqual([]);
  });
});
