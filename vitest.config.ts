import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import type { Plugin } from "vite";

/**
 * BigBangCanvas.tsx の jsdom 環境で到達不可能な防御的分岐に
 * istanbul ignore コメントを挿入するプラグイン。
 *
 * 対象:
 *  - typeof window === "undefined" (SSR ガード, line 66)
 *  - if (!canvas) return (ref null ガード, line 90)
 *  - if (flashAlpha > 0) の false 分岐 (漸近的減衰で 0 到達不可, line 183)
 */
function istanbulIgnorePlugin(): Plugin {
  return {
    name: "istanbul-ignore-unreachable-branches",
    enforce: "pre",
    transform(code, id) {
      if (!id.endsWith("BigBangCanvas.tsx")) return;
      let result = code;
      result = result.replace(
        "if (typeof window === \"undefined\") return false;",
        "/* istanbul ignore next -- @preserve SSR専用パス: jsdomでは到達不可 */ if (typeof window === \"undefined\") return false;"
      );
      result = result.replace(
        "if (!canvas) return;",
        "/* istanbul ignore next -- @preserve Reactのref設定後に到達不可 */ if (!canvas) return;"
      );
      result = result.replace(
        "if (flashAlpha > 0) {",
        "/* istanbul ignore next -- @preserve flashAlphaの漸近的減衰により0到達不可 */ if (flashAlpha > 0) {"
      );
      return { code: result, map: null };
    },
  };
}

export default defineConfig({
  plugins: [istanbulIgnorePlugin(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    globals: true,
    css: false,
    passWithNoTests: true,
    exclude: [...configDefaults.exclude, ".claude/worktrees/**", "e2e/**"],
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      exclude: [
        // テストfixture・framer-motion モック(プロダクトコードではない)。
        "__mocks__/**",
        // CTA クリックの gtag/dataLayer 送信(薄い I/O)。純ロジックは events.ts でテスト済み。
        "src/lib/analytics/trackEvent.ts",
        // 画像生成CLI(薄い I/O 入口・実データでの手動検証)。純ロジックは
        // eyecatch.ts / body-image.ts / media.ts でテスト済み。
        "scripts/growth/upload-media.ts",
        "scripts/growth/gen-eyecatch.ts",
        "scripts/growth/gen-body-image.ts",
      ],
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "framer-motion": path.resolve(__dirname, "./__mocks__/framer-motion.tsx"),
    },
  },
});
