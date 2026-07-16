import { expect, type Locator, type Page } from "@playwright/test";

export class GrowthApprovePage {
  public constructor(private readonly page: Page) {}

  public async goto(): Promise<void> {
    await this.page.goto("/growth/approve?view=approve");
    await expect(this.page.getByRole("heading", { name: "承認ページ", exact: true })).toBeVisible();
  }

  public async login(passphrase = "e2e-only-passphrase"): Promise<void> {
    await this.page.getByRole("textbox", { name: "合言葉", exact: true }).fill(passphrase);
    await this.page.getByRole("button", { name: "確認する", exact: true }).click();
    await expect(this.page.getByRole("navigation", { name: "情報源", exact: true })).toBeVisible();
  }

  public async openArticle(title: string): Promise<void> {
    const articleList = this.page.getByRole("region", { name: "記事リスト", exact: true });
    await articleList.getByRole("button", { name: title, exact: true }).click();
    await expect(this.page.getByRole("region", { name: `詳細: ${title}`, exact: true })).toBeVisible();
  }

  public async approveArticle(): Promise<void> {
    const detail = this.page.getByRole("region", { name: /^詳細:/ });
    await detail.getByRole("button", { name: /^構成案を承認/ }).click();
    await expect(detail).toBeHidden();
  }

  public async reloadAfterDraftGeneration(): Promise<void> {
    await this.page.reload();
    await expect(this.page.getByRole("navigation", { name: "情報源", exact: true })).toBeVisible();
  }

  public async editDraft(nextText: string): Promise<void> {
    const detail = this.page.getByRole("region", { name: /^詳細:/ });
    await detail.getByRole("button", { name: "下書きを編集", exact: true }).click();
    const workspace = this.page.getByRole("dialog", { name: "記事を編集", exact: true });
    const editor = workspace.getByLabel("下書き本文エディタ", { exact: true });
    await expect(editor).toBeVisible();
    await editor.fill(nextText);
    await workspace.getByRole("button", { name: "保存", exact: true }).click();
    await expect(workspace).toBeHidden();
  }

  public async openPublishQueue(): Promise<void> {
    await this.page.getByRole("navigation", { name: "情報源", exact: true }).getByRole("button", { name: "公開", exact: true }).click();
    await expect(this.publishQueue()).toBeVisible();
  }

  public async scheduleArticle(title: string): Promise<void> {
    await expect(this.publishQueue()).toContainText(title);
    await this.publishQueue().getByRole("button", { name: "予約", exact: true }).click();
    const picker = this.page.getByRole("dialog", { name: "公開日時を予約", exact: true });
    await picker.getByRole("button", { name: "明日 09:00", exact: true }).click();
  }

  public async publishAllReady(): Promise<void> {
    await this.publishQueue().getByRole("button", { name: /公開OK 2 件を今すぐ公開/ }).click();
  }

  public async completeStepUp(passphrase = "e2e-only-passphrase"): Promise<void> {
    const dialog = this.page.getByRole("dialog", { name: "重要操作の再認証", exact: true });
    await dialog.getByLabel("合言葉", { exact: true }).fill(passphrase);
    await dialog.getByRole("button", { name: "再認証する", exact: true }).click();
    await expect(dialog).toBeHidden();
  }

  public async retryNotionSync(title: string): Promise<void> {
    await this.publishResults().getByRole("button", { name: `${title}: Notion同期のみ再試行`, exact: true }).click();
  }

  public async openBodyFix(): Promise<void> {
    await this.publishQueue().getByRole("button", { name: /修正する/ }).click();
  }

  public publishQueue(): Locator {
    return this.page.getByRole("region", { name: "公開キュー", exact: true });
  }

  public publishResults(): Locator {
    return this.page.getByRole("region", { name: "公開処理結果", exact: true });
  }
}
