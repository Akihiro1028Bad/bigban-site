import { describe, expect, it } from "vitest";

import { PROPOSAL_CATEGORIES } from "./proposals";
import { DEFAULT_ARTICLE_CATEGORY, validateProposalForm } from "./proposalForm";

describe("validateProposalForm", () => {
  describe("name 必須", () => {
    it("name が空文字は error", () => {
      const r = validateProposalForm({ name: "", kind: "article" });
      expect(r).toEqual({ ok: false, error: "施策名を入力してください。" });
    });

    it("name が空白のみは error", () => {
      const r = validateProposalForm({ name: "   ", kind: "article" });
      expect(r).toEqual({ ok: false, error: "施策名を入力してください。" });
    });

    it("name は前後の空白を trim する", () => {
      const r = validateProposalForm({ name: "  夏の記事  ", kind: "event" });
      expect(r.ok && r.payload.name).toBe("夏の記事");
    });
  });

  describe("kind=article の category 写像", () => {
    it("選択した category(6値)を保持し note も持つ", () => {
      const r = validateProposalForm({
        name: "夏の記事",
        kind: "article",
        category: "コンテンツ",
        note: "x",
      });
      expect(r).toEqual({
        ok: true,
        payload: { name: "夏の記事", category: "コンテンツ", note: "x" },
      });
    });

    it("6値すべての category をそのまま保持する", () => {
      for (const category of PROPOSAL_CATEGORIES) {
        const r = validateProposalForm({ name: "記事", kind: "article", category });
        expect(r.ok && r.payload.category).toBe(category);
      }
    });

    it("category 未指定は既定カテゴリへフォールバック", () => {
      const r = validateProposalForm({ name: "記事", kind: "article" });
      expect(r.ok && r.payload.category).toBe(DEFAULT_ARTICLE_CATEGORY);
    });

    it("category が空白のみは既定カテゴリへフォールバック", () => {
      const r = validateProposalForm({ name: "記事", kind: "article", category: "  " });
      expect(r.ok && r.payload.category).toBe(DEFAULT_ARTICLE_CATEGORY);
    });

    it("6値以外の未知 category は既定カテゴリへフォールバック", () => {
      const r = validateProposalForm({ name: "記事", kind: "article", category: "謎カテゴリ" });
      expect(r.ok && r.payload.category).toBe(DEFAULT_ARTICLE_CATEGORY);
    });
  });

  describe("非 article の category 写像(詳細は persist しない縮約)", () => {
    it("event は category=イベント へ写像", () => {
      const r = validateProposalForm({ name: "体験会", kind: "event" });
      expect(r.ok && r.payload.category).toBe("イベント");
    });

    it("event は選択 category を無視してイベントへ写像", () => {
      const r = validateProposalForm({ name: "体験会", kind: "event", category: "コンテンツ" });
      expect(r.ok && r.payload.category).toBe("イベント");
    });

    it("site は category=サイトデザイン へ写像", () => {
      const r = validateProposalForm({ name: "トップ改修", kind: "site" });
      expect(r.ok && r.payload.category).toBe("サイトデザイン");
    });

    it("other は category=MEO へ写像(#214・往復整合)", () => {
      const r = validateProposalForm({ name: "その他施策", kind: "other" });
      expect(r.ok && r.payload.category).toBe("MEO");
    });
  });

  describe("note 任意", () => {
    it("note 未指定なら payload に note を含めない", () => {
      const r = validateProposalForm({ name: "記事", kind: "article", category: "MEO" });
      expect(r).toEqual({ ok: true, payload: { name: "記事", category: "MEO" } });
    });

    it("note が空白のみなら payload に note を含めない", () => {
      const r = validateProposalForm({
        name: "記事",
        kind: "article",
        category: "MEO",
        note: "   ",
      });
      expect(r.ok && "note" in r.payload).toBe(false);
    });

    it("note は前後の空白を trim して保持する", () => {
      const r = validateProposalForm({
        name: "記事",
        kind: "article",
        category: "MEO",
        note: "  狙い  ",
      });
      expect(r.ok && r.payload.note).toBe("狙い");
    });
  });
});
