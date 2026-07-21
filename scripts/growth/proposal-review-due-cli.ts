/**
 * 施策の効果検証レビュー抽出 CLI(改善案#5・記事 review-due の施策版)。
 *
 *   npm run growth:proposal-review-due                 # 検証予定日が来た施策の検証メモ候補を Notion に書く
 *   GROWTH_DRYRUN=1 npm run growth:proposal-review-due # 書かずに対象だけ表示
 *
 * プル型: Notion 施策提案 DB の取得・書き込み・LINE 通知はこの CLI が担い、承認画面(Vercel)は
 * Notion を読むだけ。効いた/効かないの最終判断は**人が select `検証結果` で決める**ので CLI は触らず、
 * `検証メモ`(候補)と `検証済み`(到来日)だけを書く。純ロジック(到来判定・メモ生成)は proposal-review-due.ts でテスト済み。
 * 薄い I/O 配線のためカバレッジ対象外(記事版 review-due-cli.ts と同じ流儀)。
 */

import "dotenv/config";

import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import {
  buildProposalReviewMemo,
  isProposalReviewDue,
  PROPOSAL_REVIEW_DATE_PROP,
  PROPOSAL_REVIEW_DONE_PROP,
  PROPOSAL_REVIEW_MEMO_PROP,
} from "./proposal-review-due";
import {
  updatePageProps,
  type NotionApiOptions,
  type NotionPage,
} from "./notion";
import { queryAllDataSource } from "./notionRepository";

const PROPOSAL_DS = "3503f4bc-b1c4-4927-91ce-7609a6c4e460"; // 施策提案
const STATUS_PROP = "ステータス";
// 承認済み(成果物化を待つ/実行済み)の施策だけを検証対象にする。
const REVIEWABLE_STATUSES = ["承認", "成果物化済"];
const NAME_PROP = "施策名";
const HYPOTHESIS_PROP = "仮説";
const SUCCESS_METRIC_PROP = "成功指標";
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

function titleOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { title?: { plain_text?: string }[] } | undefined;
  return (value?.title ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

function richTextOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { rich_text?: { plain_text?: string }[] } | undefined;
  return (value?.rich_text ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

function selectNameOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return (value?.select?.name ?? "").trim();
}

function dateStartOf(page: NotionPage, prop: string): string | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  return value?.date?.start ?? null;
}

/** 施策名は title か rich_text のどちらか(DB 定義差に強く)。 */
function proposalName(page: NotionPage): string {
  return titleOf(page, NAME_PROP) || richTextOf(page, NAME_PROP);
}

async function reviewablePages(options: NotionApiOptions): Promise<NotionPage[]> {
  const pages = await queryAllDataSource(PROPOSAL_DS, {}, options);
  return pages.filter((p) => REVIEWABLE_STATUSES.includes(selectNameOf(p, STATUS_PROP)));
}

async function notifyLine(text: string): Promise<void> {
  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) return;
  await pushTextMessage(to, text, { channelAccessToken: token, fetchFn: defaultFetch });
}

async function main(): Promise<void> {
  const options = notionOptions();
  const pages = await reviewablePages(options);

  const todayIso = new Date().toISOString().slice(0, 10);
  const due: { name: string; memo: string }[] = [];

  for (const page of pages) {
    const dueDate = dateStartOf(page, PROPOSAL_REVIEW_DATE_PROP);
    if (!isProposalReviewDue(dueDate, todayIso)) continue;
    // 既に検証済み日が入っていれば二重に拾わない(記事 review-due と同じ冪等)。
    if (dateStartOf(page, PROPOSAL_REVIEW_DONE_PROP)) continue;

    const name = proposalName(page);
    const memo = buildProposalReviewMemo(
      name,
      richTextOf(page, HYPOTHESIS_PROP),
      richTextOf(page, SUCCESS_METRIC_PROP),
    );

    if (DRYRUN) {
      console.log(`[proposal-review-due][dryrun] ${name} → ${memo}`);
    } else {
      await updatePageProps(
        page.id,
        {
          [PROPOSAL_REVIEW_MEMO_PROP]: { rich_text: [{ text: { content: memo } }] },
          [PROPOSAL_REVIEW_DONE_PROP]: { date: { start: todayIso } },
        },
        options,
      );
    }
    due.push({ name, memo });
  }

  const header = `🔎 今週検証すべき施策: ${due.length}件`;
  console.log(header);
  for (const d of due) console.log(`  - ${d.name}: ${d.memo}`);
  if (!DRYRUN && due.length > 0) {
    const body = [header, ...due.map((d) => `・${d.name}\n  ${d.memo}`)].join("\n");
    await notifyLine(body);
  }
}

main().catch((error: unknown) => {
  console.error("[proposal-review-due] 失敗:", error);
  process.exitCode = 1;
});
