// @vitest-environment node
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const localeDir = dirname(fileURLToPath(import.meta.url));

// loading.tsx は自セグメント以下を Suspense で包む。その内側で notFound() が
// 呼ばれると HTTP 200 が先に送られ、存在しない記事が 404 にならない
// (ソフト404)。記事詳細は [locale] から [slug] までのどのセグメントにも
// loading.tsx を置かず、一覧のスケルトンは (list) ルートグループに閉じ込める。
describe.each(["news", "columns"])("%s 詳細の 404 ステータス", (segment) => {
  it("記事詳細を包む loading.tsx がどのセグメントにも無い", () => {
    const chain = [
      localeDir,
      join(localeDir, segment),
      join(localeDir, segment, "[slug]"),
    ];
    for (const dir of chain) {
      expect(existsSync(join(dir, "loading.tsx")), dir).toBe(false);
    }
  });

  it("一覧のスケルトンは (list) ルートグループで一覧だけを包む", () => {
    const listDir = join(localeDir, segment, "(list)");
    expect(existsSync(join(listDir, "page.tsx"))).toBe(true);
    expect(existsSync(join(listDir, "loading.tsx"))).toBe(true);
  });
});
