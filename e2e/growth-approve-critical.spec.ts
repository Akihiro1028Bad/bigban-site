import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { blockedBoard, partialPublishBoard, proposedBoard } from "./fixtures/growthBoard";
import { GrowthApprovePage } from "./pages/GrowthApprovePage";
import { installMockGrowthApi } from "./support/mockGrowthApi";

test("承認から本文編集を経て公開予約できる", async ({ page }) => {
  const api = await installMockGrowthApi(page, { items: proposedBoard() });
  const approvePage = new GrowthApprovePage(page);

  await approvePage.goto();
  await expect.poll(() => api.unauthorizedApproveCount).toBeGreaterThan(0);
  await approvePage.login();
  await approvePage.openArticle("初心者向けピックルボール入門");
  await approvePage.approveArticle();

  await expect.poll(() => api.bodyFor("POST", "/api/growth/approve")).toEqual({
    decisions: [{ id: "article-proposed", decision: "承認" }],
  });
  await approvePage.reloadAfterDraftGeneration();
  await approvePage.openArticle("初心者向けピックルボール入門");
  await approvePage.editDraft("編集した本文です。");

  await expect.poll(() => api.bodyFor("POST", "/api/growth/draft/edit")).toEqual({
    pageId: "article-proposed",
    bodyHtml: "<p>編集した本文です。</p>",
  });

  await approvePage.openPublishQueue();
  await approvePage.scheduleArticle("初心者向けピックルボール入門");
  await approvePage.completeStepUp();

  const scheduleBody = await api.waitForBody("POST", "/api/growth/publish/schedule");
  expect(scheduleBody).toMatchObject({ pageId: "article-proposed" });
  expect(new Date(String(scheduleBody.scheduledAt)).getTime()).toBeGreaterThan(Date.now());
  await expect(approvePage.publishQueue()).toContainText("予約済み");
  await expect(approvePage.publishQueue()).toContainText("初心者向けピックルボール入門");

  const accessibility = await new AxeBuilder({ page }).analyze();
  // serious 以上(serious/critical)は WCAG 2.1 AA 違反として失敗させる。
  // moderate 以下は成果物へ記録し、内容の確認に使う。
  const failingImpacts = new Set(["serious", "critical"]);
  const minorViolations = accessibility.violations.filter(
    ({ impact }) => !failingImpacts.has(impact ?? ""),
  );
  if (minorViolations.length > 0) {
    await test.info().attach("axe-moderate-or-lower-violations", {
      body: JSON.stringify(minorViolations, null, 2),
      contentType: "application/json",
    });
  }
  expect(
    accessibility.violations.filter(({ impact }) => failingImpacts.has(impact ?? "")),
  ).toEqual([]);
  api.assertNoUnexpectedRequests();
});

test("部分公開を表示してNotion同期から再開できる", async ({ page }) => {
  const api = await installMockGrowthApi(page, {
    items: partialPublishBoard(),
    publishResponses: [
      {
        status: 207,
        body: {
          success: false,
          outcome: "partial",
          message: "microCMS公開済み、Notion同期失敗",
          completedStages: ["microcms:publish"],
          failedStage: "notion:status",
          events: [],
          externalIds: {},
          recovery: {
            retryable: true,
            resumeFrom: "notion:status",
            manualAction: "Notionを手動で公開済みにしてください。",
          },
        },
      },
      {
        status: 200,
        body: {
          success: true,
          outcome: "success",
          message: "公開しました。",
          completedStages: ["microcms:publish", "notion:status"],
          events: [],
          externalIds: {},
        },
      },
      {
        status: 200,
        body: {
          success: true,
          outcome: "success",
          message: "Notion同期を完了しました。",
          completedStages: ["microcms:publish", "notion:status"],
          events: [],
          externalIds: {},
        },
      },
    ],
  });
  const approvePage = new GrowthApprovePage(page);

  await approvePage.goto();
  await approvePage.login();
  await approvePage.openPublishQueue();
  await approvePage.publishAllReady();
  await approvePage.completeStepUp();

  await expect(approvePage.publishResults()).toContainText("success: 1");
  await expect(approvePage.publishResults()).toContainText("partial: 1");
  await expect(approvePage.publishResults()).toContainText("Notionを手動で公開済みにしてください。");
  await approvePage.retryNotionSync("公開記事A");

  await expect.poll(() => api.requestsFor("POST", "/api/growth/publish").length).toBe(3);
  expect(api.bodyAt("POST", "/api/growth/publish", 2)).toEqual({
    pageId: "article-a",
    resumeFrom: "notion:status",
  });
  await expect(approvePage.publishResults()).toContainText("success: 2");
  await expect(approvePage.publishResults()).toContainText("partial: 0");
  api.assertNoUnexpectedRequests();
});

test("公開できない理由を示して修正導線だけを表示する", async ({ page }) => {
  const api = await installMockGrowthApi(page, { items: blockedBoard() });
  const approvePage = new GrowthApprovePage(page);

  await approvePage.goto();
  await approvePage.login();
  await approvePage.openPublishQueue();

  await expect(approvePage.publishQueue()).toContainText("本文が空");
  await expect(approvePage.publishQueue()).toContainText("アイキャッチ未設定");
  await expect(approvePage.publishQueue().getByRole("button", { name: /今すぐ公開|公開OK .* 件/ })).toHaveCount(0);
  await expect(approvePage.publishQueue().getByRole("button", { name: "画像を選ぶ", exact: true })).toBeVisible();
  await approvePage.openBodyFix();
  await expect(page.getByRole("region", { name: "詳細: 本文未入力の記事", exact: true })).toBeVisible();
  api.assertNoUnexpectedRequests();
});
