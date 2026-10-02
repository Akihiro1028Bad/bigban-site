/** 週次ヘルスチェック。節を独立に実行し、1つが失敗しても他の節の結果は出す。 */
import { FETCH_INTERVAL_MS } from "../../early-morning/config";
import type { NotionClient } from "../../early-morning/notionClient";
import { NOTION_IDS } from "../../early-morning/notionIds";
import { defaultFetch } from "../../growth/http";
import { LABOLA_HOST, SITE_HOST, stringFilter } from "../hosts.mjs";
import { fetchCruxResults, formatCruxResults, formatCruxSkipped } from "./crux";
import type { Ga4Context } from "./ga4Weekly";
import { weeklyEventCounts } from "./ga4Weekly";
import { fetchGoogleAccessToken } from "./googleToken";
import { fetchLedgerWeeklyCounts } from "./ledgerWeekly";
import { fetchTennisbearApplicationCounts } from "./tennisbearApplications";
import { formatReconciliation, formatTennisbear } from "./weeklyReport";
import { addDays, jstDateOf, recentWeekStarts } from "./weeks";

export interface WeeklyDeps {
  now: Date;
  env: Record<string, string | undefined>;
  notion: NotionClient;
  sleep: (ms: number) => Promise<void>;
}

const WEEK_COUNT = 8;
const COMPLETE_EVENTS = ["labola_reserve_complete", "labola_reserve_complete_program"] as const;
const PICKLE_EVENT_LOCATION = "reserve_choice_pickle_event";
const CRUX_TITLE = "CrUX(実ユーザーの表示速度・モバイル p75)";

interface SectionResult {
  text: string;
  failed: boolean;
}

async function section(title: string, run: () => Promise<string>): Promise<SectionResult> {
  try {
    return { text: `## ${title}\n${await run()}`, failed: false };
  } catch (error) {
    return { text: `## ${title}\n取得不可: ${error instanceof Error ? error.message : String(error)}`, failed: true };
  }
}

function cruxSection(deps: WeeklyDeps): Promise<SectionResult> {
  const apiKey = deps.env.PSI_API_KEY;
  if (!apiKey) return Promise.resolve({ text: `## ${CRUX_TITLE}\n${formatCruxSkipped()}`, failed: false });
  return section(CRUX_TITLE, async () => formatCruxResults(await fetchCruxResults({ apiKey, baseUrl: `https://${SITE_HOST}` })));
}

export async function runWeekly(deps: WeeklyDeps): Promise<{ text: string; hasFailure: boolean }> {
  const weeks = recentWeekStarts(deps.now, WEEK_COUNT);
  const currentWeek = weeks[weeks.length - 1];
  const range = { startDate: weeks[0], endDate: addDays(jstDateOf(deps.now), -1) };
  // トークンは両方の GA4 節で共有する。取得に失敗したら、どちらの節も同じ理由で取得不可になる。
  let tokenPromise: Promise<string> | undefined;
  const ga4Context = async (): Promise<Ga4Context> => {
    const propertyId = deps.env.GROWTH_GA4_PROPERTY_ID;
    if (!propertyId) throw new Error("GROWTH_GA4_PROPERTY_ID が未設定です");
    tokenPromise ??= fetchGoogleAccessToken(deps.env);
    return { token: await tokenPromise, propertyId };
  };

  const results = await Promise.all([
    section("GA4 予約完了と予約台帳の週次突合", async () => {
      const ctx = await ga4Context();
      const [completed, ledger] = await Promise.all([
        weeklyEventCounts(ctx, { ...range, eventNames: COMPLETE_EVENTS, host: LABOLA_HOST }),
        fetchLedgerWeeklyCounts(deps.notion, NOTION_IDS.ledgerDb),
      ]);
      return formatReconciliation(weeks, completed, ledger.byWeek, ledger.undated, currentWeek);
    }),
    section("テニスベア行きクリックと申込(週次)", async () => {
      const ctx = await ga4Context();
      const [clicks, applications] = await Promise.all([
        weeklyEventCounts(ctx, {
          ...range,
          eventNames: ["reservation_click"],
          host: SITE_HOST,
          extraFilter: stringFilter("customEvent:location", PICKLE_EVENT_LOCATION),
        }),
        fetchTennisbearApplicationCounts({ fetchFn: defaultFetch, sleep: deps.sleep, intervalMs: FETCH_INTERVAL_MS, windowStart: weeks[0] }),
      ]);
      return formatTennisbear(weeks, clicks, applications, currentWeek);
    }),
    cruxSection(deps),
  ]);
  return { text: results.map((result) => result.text).join("\n\n"), hasFailure: results.some((result) => result.failed) };
}
