// @vitest-environment node
import { describe, expect, it } from "vitest";

import { activityBadgeLabels, pendingActivitiesOf } from "./activity";
import type { NotionPage } from "./notion";

function page(properties: NotionPage["properties"]): NotionPage {
  return { id: "i1", url: "", properties };
}

describe("pendingActivitiesOf", () => {
  it("記事のAI依頼ステータスと結果を unified activity にする", () => {
    const activities = pendingActivitiesOf(
      page({
        "修正ステータス": { select: { name: "提示中" } },
        "修正案": { rich_text: [{ plain_text: "新しい構成案" }] },
        "修正タイトル案": { rich_text: [{ plain_text: "新タイトル" }] },
        "修正依頼時刻": { date: { start: "2026-07-08T10:00:00.000Z" } },
        "アドバイスステータス": { select: { name: "依頼中" } },
        "アドバイス依頼時刻": { date: { start: "2026-07-08T10:05:00.000Z" } },
        "装飾ステータス": { select: { name: "失敗" } },
        "装飾提案": { rich_text: [{ plain_text: "JSON が壊れています" }] },
      })
    );

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "revise",
          status: "presented",
          label: "構成案修正",
          hasResult: true,
          summary: "新しい構成案",
          requestedAtMs: Date.parse("2026-07-08T10:00:00.000Z"),
        }),
        expect.objectContaining({
          kind: "title-revise",
          status: "presented",
          label: "タイトル修正",
          hasResult: true,
          summary: "新タイトル",
        }),
        expect.objectContaining({
          kind: "advise",
          status: "requested",
          hasResult: false,
        }),
        expect.objectContaining({
          kind: "decorate",
          status: "failed",
          summary: "JSON が壊れています",
        }),
      ])
    );
  });

  it("未設定の活動は返さない", () => {
    expect(pendingActivitiesOf(page({}))).toEqual([]);
  });

  it("処理中・長い結果・不正日時・plain_text 欠落を安全に整形する", () => {
    const long = `${"長い説明 ".repeat(20)}終わり`;
    const activities = pendingActivitiesOf(
      page({
        "修正ステータス": { select: { name: "処理中" } },
        "修正案": { rich_text: [{ plain_text: undefined }, { plain_text: "   " }] },
        "修正タイトル案": { rich_text: [{ plain_text: long }] },
        "修正依頼時刻": { date: { start: "not-a-date" } },
        "本文画像再生成ステータス": { select: { name: "提示中" } },
        "本文画像再生成対象": { rich_text: [{ plain_text: "https://images.microcms-assets.io/body.png" }] },
        "本文画像再生成依頼時刻": { date: { start: "2026-07-08T10:05:00.000Z" } },
      })
    );

    expect(activities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "revise",
          status: "running",
          requestedAtMs: null,
          hasResult: false,
          summary: null,
        }),
        expect.objectContaining({
          kind: "title-revise",
          status: "running",
          requestedAtMs: null,
          hasResult: true,
          summary: expect.stringMatching(/^長い説明/),
        }),
        expect.objectContaining({
          kind: "body-image-regen",
          status: "presented",
          requestedAtMs: Date.parse("2026-07-08T10:05:00.000Z"),
          summary: "https://images.microcms-assets.io/body.png",
        }),
      ])
    );
    const title = activities.find((activity) => activity.kind === "title-revise");
    expect(title?.summary?.endsWith("…")).toBe(true);
  });
});

describe("activityBadgeLabels", () => {
  it("一覧表示用バッジを活動から導出する", () => {
    expect(
      activityBadgeLabels([
        {
          kind: "revise",
          status: "presented",
          label: "構成案修正",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: true,
          summary: "案",
        },
        {
          kind: "body-image-regen",
          status: "running",
          label: "本文画像再生成",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: false,
          summary: null,
        },
        {
          kind: "decorate",
          status: "failed",
          label: "装飾提案",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: true,
          summary: "失敗",
        },
      ])
    ).toEqual(["AI処理中", "修正案あり", "画像再生成中", "直近失敗"]);
  });

  it("タイトル修正・アドバイス依頼・装飾提案のバッジを導出し重複を除く", () => {
    expect(
      activityBadgeLabels([
        {
          kind: "title-revise",
          status: "presented",
          label: "タイトル修正",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: true,
          summary: "案",
        },
        {
          kind: "advise",
          status: "requested",
          label: "スタイリング助言",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: false,
          summary: null,
        },
        {
          kind: "decorate",
          status: "presented",
          label: "装飾提案",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: true,
          summary: "提案",
        },
        {
          kind: "eyecatch-regen",
          status: "presented",
          label: "アイキャッチ再生成",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: false,
          summary: null,
        },
      ])
    ).toEqual(["AI処理中", "タイトル案あり", "アドバイス依頼中", "装飾提案あり"]);
  });

  it("画像再生成が依頼中/処理中でなければ画像再生成中バッジは出さない", () => {
    expect(
      activityBadgeLabels([
        {
          kind: "eyecatch-regen",
          status: "presented",
          label: "アイキャッチ再生成",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: false,
          summary: null,
        },
      ])
    ).toEqual([]);
  });

  it("画像再生成 activity が無い場合も画像再生成中バッジは出さない", () => {
    expect(
      activityBadgeLabels([
        {
          kind: "advise",
          status: "presented",
          label: "スタイリング助言",
          requestedAtMs: null,
          updatedAtMs: null,
          hasResult: true,
          summary: "助言",
        },
      ])
    ).toEqual([]);
  });
});
