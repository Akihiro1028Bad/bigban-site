/** 当日朝の LINE 通知の Flex メッセージ。回ごとに見出し・参加者・何回目(初参加は 🔰)・所見を載せる。 */
import { formatMonthDayTime, formatMonthDayWeekday, formatStartTime } from "../early-morning/dates";
import type { FlexMessage } from "../early-morning/lineMessage";
import { CLASS_HEADINGS } from "./config";
import { isParticipation } from "./metrics";
import type { ClassRecord, Person, Session } from "./types";

export interface LineEntry {
  displayName: string;
  ordinal: number;
  /** 所見の行(通常1行、初参加は2行)。 */
  notes: string[];
}

const HEADER_COLOR = "#1A1A1A";
const MUTED = "#8A8A8A";

export function selectEntries(
  session: Session,
  records: readonly ClassRecord[],
  people: ReadonlyMap<string, Person>,
  notes: ReadonlyMap<string, string[]>,
): LineEntry[] {
  return records
    .filter((record) => record.sessionKey === session.key && isParticipation(record))
    .map((record) => ({
      displayName: people.get(record.personKey)?.displayName ?? record.personKey,
      ordinal: record.ordinal as number,
      notes: notes.get(record.key) ?? [],
    }))
    .sort((a, b) => {
      const aFirst = a.ordinal === 1 ? 1 : 0;
      const bFirst = b.ordinal === 1 ? 1 : 0;
      return aFirst - bFirst || b.ordinal - a.ordinal || a.displayName.localeCompare(b.displayName, "ja");
    });
}

function headingOf(session: Session): string {
  return `${formatStartTime(session.startTime)} ${CLASS_HEADINGS[session.classType]}`;
}

function entryRows(entry: LineEntry) {
  return [
    {
      type: "box",
      layout: "horizontal",
      margin: "sm",
      contents: [
        { type: "text", text: entry.displayName, size: "sm", flex: 4, wrap: true },
        { type: "text", text: entry.ordinal === 1 ? "初参加 🔰" : `${entry.ordinal}回目`, size: "sm", flex: 2, align: "end" },
      ],
    },
    ...entry.notes.map((note) => ({ type: "text", text: note, size: "xs", color: MUTED, wrap: true, margin: "none" })),
  ];
}

function sessionBlock(item: { session: Session; entries: readonly LineEntry[] }) {
  return [
    { type: "text", text: `${headingOf(item.session)}  ${item.entries.length}名`, weight: "bold", size: "md", margin: "lg" },
    { type: "separator", margin: "sm" },
    ...item.entries.flatMap(entryRows),
  ];
}

export function buildFlexMessage(input: {
  date: string;
  sessions: readonly { session: Session; entries: readonly LineEntry[] }[];
  updatedAt: string;
  notionUrl: string;
}): FlexMessage {
  const day = formatMonthDayWeekday(input.date);
  const summary = input.sessions.map((item) => `${headingOf(item.session)} ${item.entries.length}名`).join("・");
  return {
    type: "flex",
    altText: `本日のDAISUKE CLASS ${day} ${summary}`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: HEADER_COLOR,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "本日の DAISUKE CLASS", color: "#FFFFFF", size: "sm" },
          { type: "text", text: day, color: "#FFFFFF", weight: "bold", size: "lg", margin: "sm" },
        ],
      },
      body: { type: "box", layout: "vertical", spacing: "sm", contents: input.sessions.flatMap(sessionBlock) },
      footer: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#333333",
            height: "sm",
            action: { type: "uri", label: "Notionで一覧を開く", uri: `${input.notionUrl}?openExternalBrowser=1` },
          },
          { type: "text", text: `最終更新 ${formatMonthDayTime(input.updatedAt)}`, size: "xxs", color: MUTED, align: "center" },
          { type: "text", text: "予約は本日朝8時時点までを反映", size: "xxs", color: MUTED, align: "center", wrap: true },
        ],
      },
    },
  };
}
