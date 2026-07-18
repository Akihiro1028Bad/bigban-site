import { describe, expect, it } from "vitest";

import type { MergedRow } from "./transform";
import { CTA_EVENTS } from "./ctaEvents";
import {
  funnelFromRows,
  LABOLA_FUNNEL_EVENTS,
  LABOLA_FUNNEL_REPORT,
} from "./labolaFunnel";

function row(eventName: string, values: [number, number]): MergedRow {
  return {
    keys: [eventName],
    metrics: {
      eventCount: { current: values[0], prior: values[1], deltaPct: null },
    },
  };
}

describe("funnelFromRows", () => {
  it("10イベントすべてを対応するファネルのバケットへ集計する", () => {
    const result = funnelFromRows([
      row(CTA_EVENTS.reservation, [1, 11]),
      row(CTA_EVENTS.reserveEntry, [2, 12]),
      row(LABOLA_FUNNEL_EVENTS.rental.input, [3, 13]),
      row(LABOLA_FUNNEL_EVENTS.rental.confirm, [4, 14]),
      row(LABOLA_FUNNEL_EVENTS.rental.pending, [5, 15]),
      row(LABOLA_FUNNEL_EVENTS.rental.complete, [6, 16]),
      row(LABOLA_FUNNEL_EVENTS.program.input, [7, 17]),
      row(LABOLA_FUNNEL_EVENTS.program.confirm, [8, 18]),
      row(LABOLA_FUNNEL_EVENTS.program.pending, [9, 19]),
      row(LABOLA_FUNNEL_EVENTS.program.complete, [10, 20]),
    ]);

    expect(result).toEqual({
      current: {
        intent: 3,
        rental: { input: 3, confirm: 4, pending: 5, complete: 6 },
        program: { input: 7, confirm: 8, pending: 9, complete: 10 },
      },
      prior: {
        intent: 23,
        rental: { input: 13, confirm: 14, pending: 15, complete: 16 },
        program: { input: 17, confirm: 18, pending: 19, complete: 20 },
      },
    });
  });

  it("intentは2種類の予約意図クリックを合算する", () => {
    expect(
      funnelFromRows([
        row(CTA_EVENTS.reservation, [4, 2]),
        row(CTA_EVENTS.reserveEntry, [6, 3]),
      ])
    ).toMatchObject({ current: { intent: 10 }, prior: { intent: 5 } });
  });

  it("未知イベント名の行は無視する", () => {
    expect(funnelFromRows([row("purchase", [99, 88])])).toEqual({
      current: {
        intent: 0,
        rental: { input: 0, confirm: 0, pending: 0, complete: 0 },
        program: { input: 0, confirm: 0, pending: 0, complete: 0 },
      },
      prior: {
        intent: 0,
        rental: { input: 0, confirm: 0, pending: 0, complete: 0 },
        program: { input: 0, confirm: 0, pending: 0, complete: 0 },
      },
    });
  });

  it("空配列では全フィールドを0にする", () => {
    expect(funnelFromRows([])).toEqual({
      current: {
        intent: 0,
        rental: { input: 0, confirm: 0, pending: 0, complete: 0 },
        program: { input: 0, confirm: 0, pending: 0, complete: 0 },
      },
      prior: {
        intent: 0,
        rental: { input: 0, confirm: 0, pending: 0, complete: 0 },
        program: { input: 0, confirm: 0, pending: 0, complete: 0 },
      },
    });
  });

  it("eventCountがない行は0件として扱う", () => {
    const result = funnelFromRows([
      { keys: [LABOLA_FUNNEL_EVENTS.rental.input], metrics: {} },
    ]);

    expect(result).toMatchObject({
      current: { rental: { input: 0 } },
      prior: { rental: { input: 0 } },
    });
  });
});

describe("LABOLA_FUNNEL_REPORT", () => {
  it("eventCountで10イベントをcurrent/priorともに取得するレポート定義", () => {
    expect(LABOLA_FUNNEL_REPORT).toEqual({
      key: "labolaFunnel",
      dimensions: ["eventName"],
      metrics: ["eventCount"],
      dimensionFilter: {
        fieldName: "eventName",
        values: [
          "labola_step_input",
          "labola_step_confirm",
          "labola_reserve_pending",
          "labola_reserve_complete",
          "labola_step_input_program",
          "labola_step_confirm_program",
          "labola_reserve_pending_program",
          "labola_reserve_complete_program",
          CTA_EVENTS.reservation,
          CTA_EVENTS.reserveEntry,
        ],
      },
      limit: 100,
      includePriorOnly: true,
    });
  });
});
