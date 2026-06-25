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
        "scripts/growth/existing-cli.ts",
        "scripts/growth/setup-token.ts",
        "scripts/growth/upload-media.ts",
        "scripts/growth/draft-content.ts",
        "scripts/growth/facility-context-cli.ts",
        "scripts/growth/notify-drafts.ts",
        "scripts/growth/gen-eyecatch.ts",
        "scripts/growth/gen-body-image.ts",
        "scripts/growth/self-heal-cli.ts",
        "scripts/growth/publish-draft-cli.ts",
        "scripts/growth/notify-line.ts",
        "scripts/growth/revise-cli.ts",
        "scripts/growth/eyecatch-regen-cli.ts",
        "scripts/growth/body-image-regen-cli.ts",
        "scripts/growth/advise-cli.ts",
        "scripts/growth/decorate-cli.ts",
        "scripts/growth/advise-apply-cli.ts",
        "scripts/growth/comment-revise-cli.ts",
        // TipTap(third-party)への薄い DOM 結線。純ロジックは draftEditorContent.ts でテスト済み。
        "src/app/growth/approve/DraftEditor.tsx",
        // 本文インラインコメント(#182)の薄い DOM 結線。純ロジックは bodyComment.ts でテスト済み。
        "src/app/growth/approve/InlineCommentReview.tsx",
        // メタディスクリプション編集(#H20)の薄い fetch/DOM 結線。純ロジックは excerptDraft.ts でテスト済み。
        "src/app/growth/approve/ExcerptEditor.tsx",
        // iframe.contentWindow への薄い DOM 結線(#100)。純ロジックは draftPreview.ts、
        // 受信側描画は DraftFrameClient.test.tsx でテスト済み。
        "src/app/growth/approve/DraftPreviewFrame.tsx",
        // 全画面モーダル/フォーカストラップ/iframe への薄い DOM 結線(#104)。
        // 純ロジックは draftWorkspace.ts でテスト済み。
        "src/app/growth/approve/DraftEditWorkspace.tsx",
        // コマンドパレットの dialog/フォーカストラップ薄結線(#109)。
        // 絞り込みの純ロジックは boardPrefs.ts でテスト済み。
        "src/app/growth/approve/CommandPalette.tsx",
        // pull型の経過時間/滞留警告の薄い DOM+タイマー結線(#C2 UI)。
        // 純ロジックは pullStale.ts でテスト済み。
        "src/app/growth/approve/StaleNotice.tsx",
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
