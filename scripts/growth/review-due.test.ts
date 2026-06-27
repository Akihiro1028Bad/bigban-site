import { describe, expect, it } from "vitest";

import {
  buildReviewMemo,
  REVIEW_DATE_PROPS,
  REVIEW_MEMO_PROP,
  REVIEW_MILESTONES,
  selectReviewMilestone,
} from "./review-due";

describe("REVIEW_MILESTONES / props", () => {
  it("28/56/90日のマイルストーンとプロパティ名を持つ(S4の判定日に対応)", () => {
    expect(REVIEW_MILESTONES).toEqual([28, 56, 90]);
    expect(REVIEW_DATE_PROPS).toEqual({ 28: "28日判定日", 56: "56日判定日", 90: "90日判定日" });
    expect(REVIEW_MEMO_PROP).toBe("判定メモ");
  });
});

describe("selectReviewMilestone", () => {
  const none = { 28: false, 56: false, 90: false };

  it("到来済みで未記録の最大マイルストーンを返す", () => {
    expect(selectReviewMilestone(30, none)).toBe(28);
    expect(selectReviewMilestone(60, none)).toBe(56);
    expect(selectReviewMilestone(120, none)).toBe(90);
  });

  it("境界(ちょうど)も到来として扱う", () => {
    expect(selectReviewMilestone(28, none)).toBe(28);
    expect(selectReviewMilestone(56, none)).toBe(56);
  });

  it("28日未満は null", () => {
    expect(selectReviewMilestone(27, none)).toBeNull();
    expect(selectReviewMilestone(0, none)).toBeNull();
  });

  it("公開日不明(null)は null", () => {
    expect(selectReviewMilestone(null, none)).toBeNull();
  });

  it("記録済みのマイルストーンは飛ばす(次の未記録を返す)", () => {
    expect(selectReviewMilestone(60, { 28: true, 56: false, 90: false })).toBe(56);
    expect(selectReviewMilestone(60, { 28: true, 56: true, 90: false })).toBeNull();
    expect(selectReviewMilestone(120, { 28: true, 56: true, 90: false })).toBe(90);
  });

  it("全て記録済みなら null", () => {
    expect(selectReviewMilestone(120, { 28: true, 56: true, 90: true })).toBeNull();
  });
});

describe("buildReviewMemo", () => {
  it("マイルストーン＋ラベル＋成功指標を1行にまとめる", () => {
    expect(buildReviewMemo(28, ["CTR弱い", "順位あと少し"], "予約クリック5件/月")).toBe(
      "[28日レビュー] CTR弱い・順位あと少し ／成功指標: 予約クリック5件/月"
    );
  });

  it("ラベルが無ければ『判定材料が少ない』", () => {
    expect(buildReviewMemo(56, [], "")).toBe("[56日レビュー] 判定材料が少ない");
  });

  it("成功指標が空なら付けない", () => {
    expect(buildReviewMemo(90, ["伸びている"], "")).toBe("[90日レビュー] 伸びている");
  });
});
