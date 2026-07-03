/**
 * 滞留検知の実行入口(#220-3/#220-4・常時稼働 PC のスケジュール実行用)。
 *
 *   npm run growth:stall-check                 # 生成待ち/生成中の滞留・wedge 行を検知して LINE 通知
 *   GROWTH_DRYRUN=1 npm run growth:stall-check # 送信せず対象だけ表示
 *
 * drafts は行ごとの依頼時刻を持たないため reaper で失敗化はしない(次回 drafts が冪等に拾い直す)。
 * ここは Notion の最終更新時刻を時計にして「止まっている」ことだけを検知し、沈黙させない=通知する。
 * pull 型ループの wedge(依頼時刻なしで時間 reap 不能)は WEDGE_LOOPS(全7ループの正典レジストリ)を
 * 回して横断的に拾う(revise 限定にしない=レビュー MEDIUM-2)。
 * 抽出の純ロジックは staleJob.ts / wedgeLoops.ts、本文は stallNotify.ts でテスト済み。薄い I/O 配線のため対象外。
 */

import "dotenv/config";

import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import { queryDataSource, type NotionApiOptions, type NotionPage } from "./notion";
import { buildStallMessage } from "./stallNotify";
import {
  selectStalledGeneratingIds,
  selectWedgeJobIds,
  type GeneratingRow,
  type StaleJobRow,
} from "./staleJob";
import { formatWedgeTitle, WEDGE_LOOPS } from "./wedgeLoops";

const IDEA_DS = "5adab8b1-f182-4123-b963-9463a2580d4a"; // 記事ネタ案
const STATUS_PROP = "ステータス";
const TITLE_PROP = "タイトル案";
// generating(#108)/reaper(#40)と同じ 15分しきい値に合わせる。
const STALL_TIMEOUT_MS = 15 * 60 * 1000;
const DRYRUN = Boolean(process.env.GROWTH_DRYRUN);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function selectOf(page: NotionPage, prop: string): string {
  const value = page.properties[prop] as { select?: { name?: string } | null } | undefined;
  return value?.select?.name ?? "";
}

function titleOf(page: NotionPage): string {
  const value = page.properties[TITLE_PROP] as { title?: { plain_text?: string }[] } | undefined;
  return (value?.title ?? []).map((r) => r.plain_text ?? "").join("").trim();
}

function dateMsOf(page: NotionPage, prop: string): number | null {
  const value = page.properties[prop] as { date?: { start?: string } | null } | undefined;
  const start = value?.date?.start;
  if (!start) return null;
  const ms = Date.parse(start);
  return Number.isNaN(ms) ? null : ms;
}

/** Notion システムプロパティ last_edited_time(型に無いので narrow に読む)。 */
function lastEditedMsOf(page: NotionPage): number | null {
  const raw = (page as { last_edited_time?: string }).last_edited_time;
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

async function notifyLine(text: string): Promise<void> {
  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) {
    process.stderr.write(
      "(LINE 未設定のため滞留通知は送れません: LINE_GROUP_ID / LINE_CHANNEL_ACCESS_TOKEN)\n"
    );
    return;
  }
  await pushTextMessage(to, text, { channelAccessToken: token, fetchFn: defaultFetch });
}

async function main(): Promise<void> {
  const opts: NotionApiOptions = { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
  const { pages } = await queryDataSource(IDEA_DS, { pageSize: 100 }, opts);

  const byId = new Map(pages.map((p) => [p.id, p]));

  // #220-3: 生成待ち/生成中のまま lastEdited から滞留している行。
  const generatingRows: (GeneratingRow & { id: string })[] = pages.map((p) => ({
    id: p.id,
    status: selectOf(p, STATUS_PROP),
    lastEditedMs: lastEditedMsOf(p),
  }));
  const stalledIds = selectStalledGeneratingIds(generatingRows, Date.now(), STALL_TIMEOUT_MS);

  // #220-4: 全 pull 型ループを横断し、busy なのに依頼時刻が無く時間 reap できない wedge 行を拾う。
  const wedgeTitles: string[] = [];
  for (const loop of WEDGE_LOOPS) {
    const rows: (StaleJobRow & { id: string })[] = pages.map((p) => ({
      id: p.id,
      status: selectOf(p, loop.statusProp),
      requestedAtMs: dateMsOf(p, loop.requestedAtProp),
    }));
    for (const id of selectWedgeJobIds(rows)) {
      wedgeTitles.push(formatWedgeTitle(titleOf(byId.get(id) as NotionPage), loop.label));
    }
  }

  const generatingTitles = stalledIds.map((id) => titleOf(byId.get(id) as NotionPage));

  const message = buildStallMessage({
    generatingTitles,
    wedgeTitles,
    thresholdMinutes: Math.round(STALL_TIMEOUT_MS / 60_000),
  });

  if (!message) {
    console.log("[stall-check] 滞留・wedge なし。");
    return;
  }
  console.log(message);
  if (!DRYRUN) await notifyLine(message);
}

main().catch((error: unknown) => {
  console.error("[stall-check] 失敗:", error);
  process.exitCode = 1;
});
