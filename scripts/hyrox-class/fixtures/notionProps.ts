/** テスト用: Notion API が読み取り時に返す形のプロパティを組み立てる。 */
export const text = (value: string) => ({ rich_text: [{ plain_text: value }] });
export const title = (value: string) => ({ title: [{ plain_text: value }] });
export const select = (value: string | null) => ({ select: value === null ? null : { name: value } });

export interface LedgerPageInput {
  no?: string;
  name?: string;
  date?: string | null;
  slot?: string;
  status?: string | null;
  court?: string | null;
  kind?: string | null;
  event?: string;
  /** 会員番号。既定は null(空)。異なる架空名の既存フィクスチャが統合されないようにする。 */
  member?: string | null;
}

/** 予約台帳の1ページ分のプロパティ。既定は 9/30 20:00 の DAISUKE CLASS の有効な予約。 */
export function ledgerProps(input: LedgerPageInput = {}): Record<string, unknown> {
  const value = {
    no: "#100",
    name: "架空一郎",
    date: "2026-09-30",
    slot: "20:00～21:00",
    status: "有効",
    court: "HYROX",
    kind: "イベント",
    event: "HYROX TRAINING @ DAISUKE CLASS",
    member: null,
    ...input,
  };
  return {
    予約番号: title(value.no),
    予約者: text(value.name),
    利用日: { date: value.date === null ? null : { start: value.date } },
    時間帯: text(value.slot),
    ステータス: select(value.status),
    コート: select(value.court),
    予約種別: select(value.kind),
    イベント名: text(value.event),
    会員番号: text(value.member ?? ""),
  };
}
