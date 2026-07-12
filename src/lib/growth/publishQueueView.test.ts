import { describe, expect, it } from "vitest";

import { formatSchedule, schedulePresets, splitPublishQueue } from "./publishQueueView";

import type { PendingItem } from "@/app/growth/approve/types";

/**
 * 公開可否判定は本文有無(hasDraftBody)を見る。UI 共有型 PendingItem には載らないが、
 * 実データ(サーバの PendingItem ミラー)には存在するため、テストでは拡張型で表現する
 * (PublishQueue.test.tsx と同じ扱い)。
 */
type QueueItem = PendingItem & { hasDraftBody?: boolean };

/**
 * テスト用 PendingItem を最小フィールドで組む(欠落は spread で上書き)。
 * 既存 partitionPublishQueue の分類は publishQueue.test.ts で担保済みのため、
 * ここでは splitPublishQueue が追加する scheduled 切り出しと reason 伝播のみを検証する。
 */
function makeItem(overrides: Partial<QueueItem>): QueueItem {
  return {
    id: "id",
    kind: "proposal",
    title: "タイトル",
    subtitle: "サブ",
    stage: "drafted",
    eyecatchUrl: "https://example.com/a.png",
    hasDraftBody: true,
    ...overrides,
  };
}

describe("splitPublishQueue", () => {
  it("公開OK(予約なし)は ready へ", () => {
    const item = makeItem({ id: "r1", scheduledAtMs: null });
    const result = splitPublishQueue([item]);
    expect(result.ready).toEqual([item]);
    expect(result.scheduled).toEqual([]);
    expect(result.blocked).toEqual([]);
  });

  it("scheduledAtMs 未設定(undefined)も ready 扱い", () => {
    const item = makeItem({ id: "r2" });
    const result = splitPublishQueue([item]);
    expect(result.ready).toEqual([item]);
    expect(result.scheduled).toEqual([]);
  });

  it("scheduledAtMs に実値があれば ready から scheduled へ切り出す", () => {
    const item = makeItem({ id: "s1", scheduledAtMs: 1_700_000_000_000 });
    const result = splitPublishQueue([item]);
    expect(result.ready).toEqual([]);
    expect(result.scheduled).toEqual([item]);
    expect(result.blocked).toEqual([]);
  });

  it("予約済みは公開時刻の昇順に並べる", () => {
    const later = makeItem({ id: "later", scheduledAtMs: 2_000 });
    const earlier = makeItem({ id: "earlier", scheduledAtMs: 1_000 });

    expect(splitPublishQueue([later, earlier]).scheduled).toEqual([earlier, later]);
  });

  it("scheduledAtMs=0 は実値として scheduled へ(0 の境界)", () => {
    const item = makeItem({ id: "s0", scheduledAtMs: 0 });
    const result = splitPublishQueue([item]);
    expect(result.scheduled).toEqual([item]);
    expect(result.ready).toEqual([]);
  });

  it("例外(公開不可)は予約時刻があっても blocked に理由付きで残る", () => {
    const noEye = makeItem({ id: "b1", eyecatchUrl: undefined, scheduledAtMs: 123 });
    const result = splitPublishQueue([noEye]);
    expect(result.ready).toEqual([]);
    expect(result.scheduled).toEqual([]);
    expect(result.blocked).toEqual([{ item: noEye, reason: "アイキャッチ未設定" }]);
  });

  it("blocked の reason が既存 publishBlockReason から伝播する(本文空)", () => {
    const noBody = makeItem({ id: "b2", hasDraftBody: false });
    const result = splitPublishQueue([noBody]);
    expect(result.blocked).toEqual([{ item: noBody, reason: "本文が空" }]);
  });

  it("下書き済み以外はキューに出さない(3分類すべて対象外)", () => {
    const proposed = makeItem({ id: "p1", stage: "proposed" });
    const result = splitPublishQueue([proposed]);
    expect(result.ready).toEqual([]);
    expect(result.scheduled).toEqual([]);
    expect(result.blocked).toEqual([]);
  });

  it("ready/scheduled/blocked が混在しても正しく3分割する", () => {
    const ready = makeItem({ id: "r", scheduledAtMs: null });
    const scheduled = makeItem({ id: "s", scheduledAtMs: 999 });
    const blocked = makeItem({ id: "b", eyecatchUrl: undefined });
    const result = splitPublishQueue([ready, scheduled, blocked]);
    expect(result.ready).toEqual([ready]);
    expect(result.scheduled).toEqual([scheduled]);
    expect(result.blocked).toEqual([{ item: blocked, reason: "アイキャッチ未設定" }]);
  });

  it("空配列は空の3分類を返す", () => {
    const result = splitPublishQueue([]);
    expect(result).toEqual({ ready: [], scheduled: [], blocked: [] });
  });
});

describe("formatSchedule", () => {
  it("proto 逐語: 月/日(曜) HH:MM・ゼロ埋め", () => {
    // 2026-01-25 は日曜。09:05 → ゼロ埋め確認。
    const d = new Date(2026, 0, 25, 9, 5, 0, 0);
    expect(formatSchedule(d)).toBe("1/25(日) 09:05");
  });

  it("曜日インデックスが各値で正しい(木曜)", () => {
    // 2026-01-29 は木曜。
    const d = new Date(2026, 0, 29, 21, 0, 0, 0);
    expect(formatSchedule(d)).toBe("1/29(木) 21:00");
  });

  it("月と日はゼロ埋めしない(1桁のまま)", () => {
    // 2026-03-02 は月曜。
    const d = new Date(2026, 2, 2, 0, 0, 0, 0);
    expect(formatSchedule(d)).toBe("3/2(月) 00:00");
  });

  it("土曜・分のゼロ埋め", () => {
    // 2026-12-05 は土曜。
    const d = new Date(2026, 11, 5, 7, 8, 0, 0);
    expect(formatSchedule(d)).toBe("12/5(土) 07:08");
  });
});

describe("schedulePresets", () => {
  // 2026-01-25(日) 08:00 を now とする(21時前)。
  const sundayMorning = new Date(2026, 0, 25, 8, 0, 0, 0).getTime();

  it("4件のプリセットを proto の順で返す", () => {
    const presets = schedulePresets(sundayMorning);
    expect(presets.map((p) => p.label)).toEqual([
      "今夜 21:00",
      "明日 09:00",
      "明日 12:00",
      "来週月曜 09:00",
    ]);
  });

  it("今夜21:00 は当日の21:00(21時前)", () => {
    const [tonight] = schedulePresets(sundayMorning);
    expect(tonight.atMs).toBe(new Date(2026, 0, 25, 21, 0, 0, 0).getTime());
  });

  it("21時を過ぎていたら翌日21:00へ送り、ラベルも明日にする", () => {
    const sundayNight = new Date(2026, 0, 25, 22, 30, 0, 0).getTime();
    const [tonight] = schedulePresets(sundayNight);
    expect(tonight).toEqual({
      label: "明日 21:00",
      atMs: new Date(2026, 0, 26, 21, 0, 0, 0).getTime(),
    });
  });

  it("ちょうど21時でも過去扱いを避けて翌日へ送る", () => {
    const sundayAtNine = new Date(2026, 0, 25, 21, 0, 0, 0).getTime();
    expect(schedulePresets(sundayAtNine)[0].atMs).toBe(
      new Date(2026, 0, 26, 21, 0, 0, 0).getTime()
    );
  });

  it("明日09:00 / 明日12:00 は翌日", () => {
    const presets = schedulePresets(sundayMorning);
    expect(presets[1].atMs).toBe(new Date(2026, 0, 26, 9, 0, 0, 0).getTime());
    expect(presets[2].atMs).toBe(new Date(2026, 0, 26, 12, 0, 0, 0).getTime());
  });

  it("来週月曜09:00: 日曜起点は翌日(2026-01-26 月)", () => {
    const presets = schedulePresets(sundayMorning);
    expect(presets[3].atMs).toBe(new Date(2026, 0, 26, 9, 0, 0, 0).getTime());
  });

  it("来週月曜: 当日が月曜なら7日後の月曜(常に未来)", () => {
    // 2026-01-26(月) 10:00。
    const monday = new Date(2026, 0, 26, 10, 0, 0, 0).getTime();
    const presets = schedulePresets(monday);
    expect(presets[3].atMs).toBe(new Date(2026, 1, 2, 9, 0, 0, 0).getTime());
  });

  it("来週月曜: 週跨ぎ(金曜起点→次週月曜)", () => {
    // 2026-01-30(金) 15:00 → 2026-02-02(月)。
    const friday = new Date(2026, 0, 30, 15, 0, 0, 0).getTime();
    const presets = schedulePresets(friday);
    expect(presets[3].atMs).toBe(new Date(2026, 1, 2, 9, 0, 0, 0).getTime());
  });
});
