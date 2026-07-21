/** 公式サイトと週次集計で共有するLaBOLA予約導線イベントの正典。 */

export const LABOLA_ENTRY_EVENTS = {
  rental: "labola_entry_rental",
  program: "labola_entry_program",
} as const;

export type LabolaEntryKind = keyof typeof LABOLA_ENTRY_EVENTS;

export const LABOLA_FUNNEL_EVENTS = {
  rental: {
    input: "labola_step_input",
    complete: "labola_reserve_complete",
  },
  program: {
    input: "labola_step_input_program",
    complete: "labola_reserve_complete_program",
  },
} as const;

/** 専用流入イベントの本番反映後、最初の完全な月曜始まりの週。 */
export const LABOLA_MEASUREMENT_START_YMD = "2026-07-27";
