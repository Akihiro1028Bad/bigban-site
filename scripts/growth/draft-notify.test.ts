// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  buildPreviewUrl,
  previewUrlOrNull,
  buildDraftNotifyMessage,
  buildDraftFailureMessage,
  buildDraftFlex,
  type DraftNotifyItem,
  type DraftFlexItem,
} from "./draft-notify";

describe("buildDraftFailureMessage", () => {
  const msg = buildDraftFailureMessage({
    failedStage: "create",
    error: "504 gateway timeout",
    specPath: ".growth-tmp/roadmap.json",
  });

  it("外部障害の可能性と再開可能であることを伝える", () => {
    expect(msg).toContain("下書き");
    expect(msg).toMatch(/外部障害|未作成|失敗/);
    expect(msg).toContain("再開");
  });

  it("失敗した工程・理由・ステージ済みパスを含む", () => {
    expect(msg).toContain("create");
    expect(msg).toContain("504 gateway timeout");
    expect(msg).toContain(".growth-tmp/roadmap.json");
  });

  it("再開手順（コマンド）を含む", () => {
    expect(msg).toContain("npm run growth:publish-draft");
    expect(msg).toContain("npm run growth:drafts");
  });
});

describe("previewUrlOrNull", () => {
  const base = {
    siteUrl: "https://www.thepicklebang.com",
    secret: "s3cret",
    contentId: "abc123",
    draftKey: "dk-xyz",
  };

  it("必要な値が揃っていればプレビューURLを返す", () => {
    expect(previewUrlOrNull(base)).toBe(
      "https://www.thepicklebang.com/api/draft/enable?secret=s3cret&draftKey=dk-xyz&contentId=abc123"
    );
  });

  it("secret が無ければ null（通知は続行させるため）", () => {
    expect(previewUrlOrNull({ ...base, secret: null })).toBeNull();
    expect(previewUrlOrNull({ ...base, secret: undefined })).toBeNull();
    expect(previewUrlOrNull({ ...base, secret: "" })).toBeNull();
  });

  it("siteUrl が無ければ null", () => {
    expect(previewUrlOrNull({ ...base, siteUrl: null })).toBeNull();
  });

  it("draftKey が無ければ null", () => {
    expect(previewUrlOrNull({ ...base, draftKey: null })).toBeNull();
  });
});

describe("buildPreviewUrl", () => {
  it("プレビュー入口(Pattern A)の URL を secret/draftKey/contentId 付きで組み立てる", () => {
    const url = buildPreviewUrl({
      siteUrl: "https://www.thepicklebang.com",
      secret: "s3cret",
      contentId: "abc123",
      draftKey: "dk-xyz",
    });
    expect(url).toBe(
      "https://www.thepicklebang.com/api/draft/enable?secret=s3cret&draftKey=dk-xyz&contentId=abc123"
    );
  });

  it("siteUrl の末尾スラッシュを正規化する", () => {
    const url = buildPreviewUrl({
      siteUrl: "https://www.thepicklebang.com/",
      secret: "s",
      contentId: "id",
      draftKey: "dk",
    });
    expect(url).toContain("https://www.thepicklebang.com/api/draft/enable?");
    expect(url).not.toContain(".com//api");
  });

  it("特殊文字を含む値を URL エンコードする", () => {
    const url = buildPreviewUrl({
      siteUrl: "https://example.com",
      secret: "a b&c",
      contentId: "id",
      draftKey: "k/=?",
    });
    expect(url).toContain("secret=a+b%26c");
    expect(url).toContain("draftKey=k%2F%3D%3F");
  });
});

describe("buildDraftNotifyMessage", () => {
  const withUrl: DraftNotifyItem = {
    title: "本八幡で始めるピックルボール",
    contentId: "c1",
    previewUrl: "https://www.thepicklebang.com/api/draft/enable?secret=s&draftKey=dk&contentId=c1",
  };
  const noUrl: DraftNotifyItem = {
    title: "雨の日でも続けられる屋内コート",
    contentId: "c2",
    previewUrl: null,
  };

  it("件数とタイトル・プレビューURLを含むメッセージを作る", () => {
    const msg = buildDraftNotifyMessage([withUrl]);
    expect(msg).toContain("下書きを1件作成しました");
    expect(msg).toContain("本八幡で始めるピックルボール");
    expect(msg).toContain(withUrl.previewUrl as string);
  });

  it("プレビューURLが無い記事は下書きIDで案内する", () => {
    const msg = buildDraftNotifyMessage([noUrl]);
    expect(msg).toContain("雨の日でも続けられる屋内コート");
    expect(msg).toContain("c2");
    expect(msg).toContain("プレビューURLは取得できませんでした");
  });

  it("複数記事を番号付きでまとめる", () => {
    const msg = buildDraftNotifyMessage([withUrl, noUrl]);
    expect(msg).toContain("下書きを2件作成しました");
    expect(msg).toContain("1. ");
    expect(msg).toContain("2. ");
  });

  it("空配列のときは作成なしのメッセージを返す", () => {
    const msg = buildDraftNotifyMessage([]);
    expect(msg).toContain("下書きは作成されませんでした");
  });
});

describe("buildDraftFlex", () => {
  const full: DraftFlexItem = {
    title: "本八幡の屋内コート",
    excerpt: "雨でも続けられる屋内ピックルボール。",
    category: "お知らせ",
    eyecatchUrl: "https://img.example/cover.png",
    previewUrl: "https://www.thepicklebang.com/api/draft/enable?secret=s&draftKey=dk&contentId=c1",
    contentId: "c1",
  };

  it("カルーセル(記事ごとに1バブル)を組み立てる", () => {
    const flex = buildDraftFlex([full, { ...full, contentId: "c2", title: "2本目" }]);
    expect(flex.type).toBe("carousel");
    expect(flex.contents).toHaveLength(2);
    expect(flex.contents.every((b) => b.type === "bubble")).toBe(true);
  });

  it("各カードに hero画像・カテゴリバッジ・タイトル・抜粋・プレビューボタンを入れる", () => {
    const [bubble] = buildDraftFlex([full]).contents;

    // hero(アイキャッチ・16:9)
    expect(bubble.hero).toEqual({
      type: "image",
      url: full.eyecatchUrl,
      size: "full",
      aspectRatio: "16:9",
      aspectMode: "cover",
    });

    const body = bubble.body!.contents;
    // 先頭はカテゴリバッジ(ピル)
    const badge = body[0];
    expect(badge.type).toBe("box");
    const pillText = JSON.stringify(badge);
    expect(pillText).toContain("お知らせ");
    // タイトル(太字・2行まで)
    const title = body.find((c) => c.type === "text" && c.text === full.title);
    expect(title).toMatchObject({ weight: "bold", maxLines: 2 });
    // 抜粋(グレー・3行まで)
    const excerpt = body.find((c) => c.type === "text" && c.text === full.excerpt);
    expect(excerpt).toMatchObject({ maxLines: 3 });

    // フッターはプレビューボタン(uri)
    const footerBtn = bubble.footer!.contents[0];
    expect(footerBtn).toMatchObject({
      type: "button",
      action: { type: "uri", label: "プレビューを開く", uri: full.previewUrl },
    });
  });

  it("アイキャッチが無ければ hero を省略する", () => {
    const [bubble] = buildDraftFlex([{ ...full, eyecatchUrl: null }]).contents;
    expect(bubble.hero).toBeUndefined();
  });

  it("カテゴリが空ならバッジを出さず、本文はタイトルから始まる", () => {
    const [bubble] = buildDraftFlex([{ ...full, category: "" }]).contents;
    const first = bubble.body!.contents[0];
    expect(first).toMatchObject({ type: "text", text: full.title });
  });

  it("抜粋が空なら抜粋テキストを入れない", () => {
    const [bubble] = buildDraftFlex([{ ...full, excerpt: "" }]).contents;
    const texts = bubble.body!.contents.filter((c) => c.type === "text");
    // タイトルのみ(抜粋なし)
    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({ text: full.title });
  });

  it("プレビューURLが無ければボタンの代わりに下書きIDを案内する", () => {
    const [bubble] = buildDraftFlex([{ ...full, previewUrl: null }]).contents;
    const footer = bubble.footer!.contents[0];
    expect(footer.type).toBe("text");
    expect(JSON.stringify(footer)).toContain("c1");
    expect(JSON.stringify(footer)).toContain("プレビューURLは取得できませんでした");
  });

  it("12件を超えるときは先頭12バブルに制限する", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({
      ...full,
      contentId: `c${i}`,
      title: `記事${i}`,
    }));
    expect(buildDraftFlex(many).contents).toHaveLength(12);
  });

  it("0件なら空のカルーセル(呼び出し側がテキストへフォールバック)", () => {
    const flex = buildDraftFlex([]);
    expect(flex).toEqual({ type: "carousel", contents: [] });
  });
});
