/**
 * 公開後レビュー抽出 CLI(#計測強化 S7・常時稼働 PC のスケジュール実行用)。
 *
 *   npm run growth:review-due                 # 公開28/56/90日が到来した記事の判定メモ候補を Notion に書く
 *   GROWTH_DRYRUN=1 npm run growth:review-due # 書かずに対象だけ表示
 *
 * プル型: Notion 公開記事の取得・microCMS publishedAt・Notion 書き込み・LINE 通知はこの CLI が担い、
 * 承認画面(Vercel)は Notion を読むだけ。`公開後判定`(select)は**人が決める**ので CLI は触らず、
 * `判定メモ`(候補＋根拠)と各マイルストーンの `判定日` だけを書く。
 * 純ロジック(到来判定・メモ生成)は review-due.ts でテスト済み。薄い I/O 配線のためカバレッジ対象外。
 */

import "dotenv/config";

import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import { METRICS_PROPS, parseMetrics } from "./metrics";
import { reviewLabels } from "./metricsReview";
import {
  buildReviewMemo,
  daysSincePublished,
  REVIEW_DATE_PROPS,
  REVIEW_MEMO_PROP,
  selectReviewMilestone,
  type ReviewMilestone,
} from "./review-due";
import {
  queryDataSource,
  updatePageProps,
  type NotionApiOptions,
  type NotionPage,
} from "./notion";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const STATUS_PROP = "ステータス";
const PUBLISHED_STATUS = "公開済み";
const CONTENT_ID_PROP = "下書きID";
const SUCCESS_METRIC_PROP = "成功指標";
const CONTENT_ID_RE = /^[a-z0-9-]{1,64}$/;
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

function richTextOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { rich_text?: { plain_text?: string }[] } | undefined;
  return (value?.rich_text ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

function titleOf(page: NotionPage): string {
  const value = page.properties["タイトル案"] as { title?: { plain_text?: string }[] } | undefined;
  return (value?.title ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

/** date プロパティに開始日が入っているか(=そのマイルストーンは記録済み)。 */
function hasDate(page: NotionPage, prop: string): boolean {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  return Boolean(value?.date?.start);
}

/** 公開記事(ステータス=公開済み)のページを取得する。 */
async function publishedPages(options: NotionApiOptions): Promise<NotionPage[]> {
  const { pages } = await queryDataSource(
    IDEA_DS,
    { filter: { property: STATUS_PROP, select: { equals: PUBLISHED_STATUS } }, pageSize: 100 },
    options
  );
  return pages;
}

/** microCMS 公開記事を contentId で引いて publishedAt を得る。失敗は null。 */
async function fetchPublishedAt(domain: string, apiKey: string, contentId: string): Promise<string | null> {
  if (!CONTENT_ID_RE.test(contentId)) return null;
  const url = `https://${domain}.microcms.io/api/v1/news/${encodeURIComponent(contentId)}`;
  const res = await defaultFetch(url, { headers: { "X-MICROCMS-API-KEY": apiKey } });
  if (!res.ok) return null;
  const body = (await res.json()) as { publishedAt?: string };
  return body.publishedAt ?? null;
}

async function notifyLine(text: string): Promise<void> {
  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) return;
  await pushTextMessage(to, text, { channelAccessToken: token, fetchFn: defaultFetch });
}

async function main(): Promise<void> {
  const options = notionOptions();
  const pages = await publishedPages(options);

  const domain = requireEnv("MICROCMS_SERVICE_DOMAIN");
  const microKey = process.env.MICROCMS_CONTENT_API_KEY ?? process.env.MICROCMS_API_KEY;
  if (!microKey) {
    throw new Error("MICROCMS_CONTENT_API_KEY(または MICROCMS_API_KEY)が未設定です。");
  }

  const nowMs = Date.now();
  const todayIso = new Date(nowMs).toISOString().slice(0, 10);
  const due: { title: string; milestone: ReviewMilestone; memo: string }[] = [];
  let skipped = 0;

  for (const page of pages) {
    const contentId = richTextOf(page, CONTENT_ID_PROP);
    if (!contentId) continue;
    const publishedAt = await fetchPublishedAt(domain, microKey, contentId);
    if (!publishedAt) {
      skipped += 1;
      console.warn(`[review-due] publishedAt 取得不可: ${titleOf(page)} (contentId=${contentId})`);
      continue;
    }
    const days = daysSincePublished(publishedAt, nowMs);
    const done = {
      28: hasDate(page, REVIEW_DATE_PROPS[28]),
      56: hasDate(page, REVIEW_DATE_PROPS[56]),
      90: hasDate(page, REVIEW_DATE_PROPS[90]),
    } as Record<ReviewMilestone, boolean>;
    const milestone = selectReviewMilestone(days, done);
    if (!milestone) continue;

    const metrics = parseMetrics(richTextOf(page, METRICS_PROPS.data));
    const labels = metrics ? reviewLabels(metrics, days) : [];
    const memo = buildReviewMemo(milestone, labels, richTextOf(page, SUCCESS_METRIC_PROP));

    if (DRYRUN) {
      console.log(`[review-due][dryrun] ${titleOf(page)} (${days}日) → ${memo}`);
    } else {
      await updatePageProps(
        page.id,
        {
          [REVIEW_MEMO_PROP]: { rich_text: [{ text: { content: memo } }] },
          [REVIEW_DATE_PROPS[milestone]]: { date: { start: todayIso } },
        },
        options
      );
    }
    due.push({ title: titleOf(page), milestone, memo });
  }

  const header = `🔎 今週レビューすべき記事: ${due.length}件${skipped > 0 ? ` / 取得不可 ${skipped}件` : ""}`;
  console.log(header);
  for (const d of due) console.log(`  - [${d.milestone}日] ${d.title}: ${d.memo}`);
  if (!DRYRUN && due.length > 0) {
    const body = [header, ...due.map((d) => `・[${d.milestone}日] ${d.title}\n  ${d.memo}`)].join("\n");
    await notifyLine(body);
  }
}

main().catch((error: unknown) => {
  console.error("[review-due] 失敗:", error);
  process.exitCode = 1;
});
