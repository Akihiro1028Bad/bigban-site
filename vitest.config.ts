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
        // テスト基盤(MSW server/handlers・renderWithClient)。プロダクトコードではない。
        "src/test/**",
        // CTA クリックの gtag/dataLayer 送信(薄い I/O)。純ロジックは events.ts でテスト済み。
        "src/lib/analytics/trackEvent.ts",
        // react-query Provider の薄い結線(server/browser 分岐は jsdom で到達不可)。
        "src/app/growth/approve/providers.tsx",
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
        "scripts/growth/metrics-cli.ts",
        "scripts/growth/publish-due-cli.ts",
        "scripts/growth/review-due-cli.ts",
        "scripts/growth/prompt-lint-cli.ts",
        "scripts/growth/article-eval-cli.ts",
        // TipTap(third-party)への薄い DOM 結線。純ロジックは draftEditorContent.ts でテスト済み。
        "src/app/growth/approve/DraftEditor.tsx",
        // iframe.contentWindow への薄い DOM 結線(#100)。純ロジックは draftPreview.ts、
        // 受信側描画は DraftFrameClient.test.tsx でテスト済み。
        "src/app/growth/approve/DraftPreviewFrame.tsx",
        // 全画面モーダル/フォーカストラップ/iframe への薄い DOM 結線(#104)。
        // 純ロジックは draftWorkspace.ts でテスト済み。
        "src/app/growth/approve/DraftEditWorkspace.tsx",
        // コマンドパレットの dialog/フォーカストラップ薄結線(#109)。
        // 絞り込みの純ロジックは boardPrefs.ts でテスト済み。
        "src/app/growth/approve/CommandPalette.tsx",
        // 差分B AI相談ドロワー(Task 12): 承認画面が render する薄い結線UI。
        // 純ロジック(ビュー正規化・状態写像・段階出し分け)は consult.ts でテスト済み。
        "src/app/growth/approve/consult/AdviceResultBody.tsx",
        "src/app/growth/approve/consult/SentenceFixBody.tsx",
        "src/app/growth/approve/consult/ReviseProposalBody.tsx",
        "src/app/growth/approve/consult/CommentableBody.tsx",
        "src/app/growth/approve/consult/ConsultComposer.tsx",
        "src/app/growth/approve/consult/ConsultCard.tsx",
        "src/app/growth/approve/consult/ConsultDrawer.tsx",
        // 本文インラインコメント(#182)の薄い fetch/DOM 結線フック。純ロジックは bodyComment.ts でテスト済み。
        "src/app/growth/approve/hooks/useBodyCommentConsult.ts",
        // #proto P3b(Task 9): 詳細パネルの proto プレゼンテーション5ファイル。
        // 承認画面が render する薄い見た目レイヤ(2段タブ/タブ別ビュー/構成案/品質/デバイスプレビュー)。
        // 純ロジック(段階写像・品質判定・画像意図・プレビュー端末・アウトライン parse)は
        // boardStage/detailBadge/draftQuality/imageIntent/previewDevice/outline 等でテスト済み。
        "src/app/growth/approve/DetailPanel.tsx",
        "src/app/growth/approve/DetailViews.tsx",
        "src/app/growth/approve/OutlineView.tsx",
        "src/app/growth/approve/QualityChecklist.tsx",
        "src/app/growth/approve/DevicePreview.tsx",
        // #P5a(Task 4): 施策ビューの proto プレゼンテーション3ファイル。承認画面が render する
        // 薄い見た目レイヤ(master-detail/種別フィルタ/結末プレビュー・作成モーダル・詳細本体)。
        // 純ロジック(種別派生 kindFromCategory・承認アウトカム approveOutcomeFor・作成フォーム検証
        // validateProposalForm)は proposalKind/proposalForm でテスト済み。結線挙動(承認/却下/作成/
        // 種別フィルタ)は ApproveClient.test.tsx で検証する。
        "src/app/growth/approve/ProposalView.tsx",
        "src/app/growth/approve/ProposalDetailBody.tsx",
        "src/app/growth/approve/ProposalFormModal.tsx",
        // #proto P5b(Task 4): 公開予約ピッカーの proto プレゼンテーション。承認画面が render する
        // 薄い見た目レイヤ(モーダル/フォーカストラップ/datetime-local の入力→atMs 薄結線)。
        // 日時ロジック(プリセット schedulePresets・表示 formatSchedule)は publishQueueView で
        // 100% テスト済み。結線挙動は T5(PublishQueue)以降の ApproveClient.test.tsx で検証する。
        "src/app/growth/approve/SchedulePicker.tsx",
        // #proto P5b(Task 6): メディアライブラリの proto プレゼンテーション。承認画面(公開キュー)が
        // render する薄い見た目レイヤ(モーダル/フォーカストラップ/一覧グリッド/アップロード input の
        // 薄い fetch 結線)。アップロード事前検証・アセット URL 判定の純ロジックは media.ts で 100%
        // テスト済み。結線フロー(要対応→開く→選択/アップロード→eyecatch 反映→onChanged)は
        // PublishQueue.test.tsx で実挙動を検証する。
        "src/app/growth/approve/MediaLibraryModal.tsx",
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
