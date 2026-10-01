import { describe, it, expect } from "vitest";
import { buildAutoReplyHtml, buildAutoReplyText } from "./email-templates";

const BASE_PARAMS = {
  name: "山田太郎",
  categoryLabel: "コート予約",
  message: "コートの予約について問い合わせます",
};

describe("buildAutoReplyHtml", () => {
  it("お客様の名前が含まれる", () => {
    const html = buildAutoReplyHtml(BASE_PARAMS);
    expect(html).toContain("山田太郎");
  });

  it("カテゴリラベルが含まれる", () => {
    const html = buildAutoReplyHtml(BASE_PARAMS);
    expect(html).toContain("コート予約");
  });

  it("メッセージ内容が含まれる", () => {
    const html = buildAutoReplyHtml(BASE_PARAMS);
    expect(html).toContain("コートの予約について問い合わせます");
  });

  it("施設情報が含まれる", () => {
    const html = buildAutoReplyHtml(BASE_PARAMS);
    expect(html).toContain("千葉県市川市八幡2-16-6");
    expect(html).toContain("6:00");
    expect(html).toContain("25:00");
  });

  it("HTMLエスケープされる", () => {
    const html = buildAutoReplyHtml({
      ...BASE_PARAMS,
      name: '<script>alert("xss")</script>',
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("メッセージ内のHTMLもエスケープされる", () => {
    const html = buildAutoReplyHtml({
      ...BASE_PARAMS,
      message: '<img src="x" onerror="alert(1)">',
    });
    expect(html).not.toContain('<img src="x"');
    expect(html).toContain("&lt;img");
  });

  it("ブランドカラーが使用されている", () => {
    const html = buildAutoReplyHtml(BASE_PARAMS);
    expect(html).toContain("#0A0A0A");
    expect(html).toContain("#F5F2EE");
  });
});

describe("buildAutoReplyText", () => {
  it("お客様の名前が含まれる", () => {
    const text = buildAutoReplyText(BASE_PARAMS);
    expect(text).toContain("山田太郎");
  });

  it("カテゴリラベルが含まれる", () => {
    const text = buildAutoReplyText(BASE_PARAMS);
    expect(text).toContain("コート予約");
  });

  it("メッセージ内容が含まれる", () => {
    const text = buildAutoReplyText(BASE_PARAMS);
    expect(text).toContain("コートの予約について問い合わせます");
  });

  it("施設情報が含まれる", () => {
    const text = buildAutoReplyText(BASE_PARAMS);
    expect(text).toContain("千葉県市川市八幡2-16-6");
  });
});
