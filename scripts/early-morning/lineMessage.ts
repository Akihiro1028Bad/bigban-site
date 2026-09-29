/** 前夜 LINE 通知の Flex メッセージ。参加者一覧と各人の何回目かだけを載せる。 */
import { formatMonthDayTime, formatMonthDayWeekday, formatStartTime } from "./dates";
import type { AttendanceRecord, Person, Session } from "./types";

export interface LineEntry {
  displayName: string;
  ordinal: number;
  isLaBola: boolean;
  /** その人の所見。なければ空文字。 */
  note: string;
}

export interface FlexMessage {
  type: "flex";
  altText: string;
  contents: Record<string, unknown>;
}

const HEADER_COLOR = "#11317B";
const MUTED = "#8A8A8A";

export function selectLineEntries(
  session: Session,
  records: readonly AttendanceRecord[],
  people: ReadonlyMap<string, Person>,
  notes: ReadonlyMap<string, string>,
): LineEntry[] {
  const entries = records
    .filter((record) => record.date === session.date && record.status === "申込" && record.ordinal !== null)
    .map((record) => ({
      displayName: people.get(record.personKey)?.displayName ?? record.personKey,
      ordinal: record.ordinal as number,
      isLaBola: record.route !== "テニスベア",
      note: notes.get(record.personKey) ?? "",
    }));
  return entries.sort((a, b) => {
    const aFirst = a.ordinal === 1 ? 1 : 0;
    const bFirst = b.ordinal === 1 ? 1 : 0;
    return aFirst - bFirst || b.ordinal - a.ordinal || a.displayName.localeCompare(b.displayName, "ja");
  });
}

function entryRow(entry: LineEntry) {
  const row = {
    type: "box",
    layout: "horizontal",
    margin: "sm",
    contents: [
      { type: "text", text: `${entry.displayName}${entry.isLaBola ? "（LaBOLA）" : ""}`, size: "sm", flex: 4, wrap: true },
      { type: "text", text: entry.ordinal === 1 ? "初参加 🔰" : `${entry.ordinal}回目`, size: "sm", flex: 2, align: "end" },
    ],
  };
  if (entry.note === "") return [row];
  return [row, { type: "text", text: entry.note, size: "xs", color: MUTED, wrap: true, margin: "none" }];
}

export function buildFlexMessage(input: {
  sessionDate: string;
  startTime: string;
  /** 見出しに添えるクラス名。付けないときは null。 */
  classLabel: string | null;
  entries: readonly LineEntry[];
  updatedAt: string;
  notionUrl: string;
}): FlexMessage {
  const day = formatMonthDayWeekday(input.sessionDate);
  const heading = `${day} ${formatStartTime(input.startTime)}`;
  const count = input.entries.length;
  const rows =
    count > 0
      ? input.entries.flatMap(entryRow)
      : [{ type: "text", text: "まだ申込はありません", size: "sm", color: MUTED }];
  return {
    type: "flex",
    altText: `明日の早朝ピックル ${day} 申込${count}名`,
    contents: {
      type: "bubble",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: HEADER_COLOR,
        paddingAll: "16px",
        contents: [
          { type: "text", text: "明日の早朝ピックル", color: "#FFFFFF", size: "sm" },
          { type: "text", text: input.classLabel === null ? heading : `${heading} ${input.classLabel}`, color: "#FFFFFF", weight: "bold", size: "lg", margin: "sm" },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "sm",
        contents: [
          { type: "text", text: `申込 ${count}名`, weight: "bold", size: "md" },
          { type: "separator", margin: "md" },
          ...rows,
        ],
      },
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
          { type: "text", text: "LaBOLA予約は本日朝8時時点までを反映", size: "xxs", color: MUTED, align: "center", wrap: true },
        ],
      },
    },
  };
}
