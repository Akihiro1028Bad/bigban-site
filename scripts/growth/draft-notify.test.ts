// @vitest-environment node
import { describe, it, expect } from "vitest";

import {
  buildPreviewUrl,
  previewUrlOrNull,
  buildDraftNotifyMessage,
  type DraftNotifyItem,
} from "./draft-notify";

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
