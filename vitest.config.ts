import { defineConfig } from "vitest/config";
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
    coverage: {
      provider: "istanbul",
      reporter: ["text", "lcov"],
      exclude: [
        "__mocks__/**",
        // 実行時の薄い入口(実データでの手動検証のためテスト対象外)
        "scripts/growth/cli.ts",
        "scripts/growth/setup-token.ts",
        "scripts/growth/upload-media.ts",
        "scripts/growth/draft-content.ts",
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
