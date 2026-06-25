// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { AdviceFix } from "./advise";
import {
  ADVISE_APPLY_BUSY_STATUSES,
  ADVISE_APPLY_PROPS,
  ADVISE_APPLY_STATUSES,
  AdviceApplyProposalSchema,
  applyAdviceItem,
  applyAdviceItems,
  applyRowFromPage,
  applyStatusOf,
  applyViewOf,
  buildApplyClearProps,
  buildApplyFailProps,
  buildApplyPresentProps,
  buildApplyProcessingProps,
  buildApplyRequestProps,
  classifyFix,
  FIX_REASON_EXCLUDED,
  FIX_REASON_NO_ANCHOR,
  FIX_REASON_NO_QUOTE,
  findAnchorBlock,
  isApplicableArea,
  parseApplyProposal,
  selectApplicableFixes,
  selectStaleApplyIds,
  serializeApplyProposal,
  type AdviceApplyRow,
} from "./advise-apply";
import type { NotionPage } from "./notion";

const BODY = "<h2>見出し</h2><p>これは導入の段落です。</p><p>本文の二つ目の段落です。</p>";

function fix(over: Partial<AdviceFix>): AdviceFix {
  return { area: "文体", severity: "中", reason: "r", suggestion: "s", ...over };
}

function page(props: Record<string, unknown>): NotionPage {
  return { id: "i1", url: "", properties: props };
}

describe("isApplicableArea", () => {
  it("文体・読みやすさ・構成系は反映可", () => {
    expect(isApplicableArea("文体")).toBe(true);
    expect(isApplicableArea("読みやすさ")).toBe(true);
    expect(isApplicableArea("構成の組み替え")).toBe(true);
  });
  it("事実・正確性・数値・タイトル・リンク・統計・出典は反映不可(除外語)", () => {
    expect(isApplicableArea("正確性")).toBe(false);
    expect(isApplicableArea("数値")).toBe(false);
    expect(isApplicableArea("タイトル")).toBe(false);
    expect(isApplicableArea("リンク")).toBe(false);
    expect(isApplicableArea("統計データ")).toBe(false);
    expect(isApplicableArea("出典の明記")).toBe(false);
    // 除外語が含まれれば、文体的な語があっても false
    expect(isApplicableArea("文体（ただし事実関係）")).toBe(false);
  });
  it("除外語を含まない area は反映可(#178: ホワイトリスト撤廃で取りこぼしを減らす)", () => {
    // 旧ホワイトリストに無く取りこぼしていた文体・読みやすさ・構成系
    expect(isApplicableArea("見た目")).toBe(true);
    expect(isApplicableArea("テンポ")).toBe(true);
    expect(isApplicableArea("導入の流れ")).toBe(true);
    expect(isApplicableArea("一文の長さ")).toBe(true);
    expect(isApplicableArea("重複")).toBe(true);
  });
});

describe("classifyFix", () => {
  it("3条件を満たせば applicable(確定した quote/blockIndex を返す)", () => {
    expect(classifyFix(fix({ area: "文体", quote: "導入の段落" }), BODY)).toEqual({
      applicable: true,
      quote: "導入の段落",
      blockIndex: 1,
    });
  });
  it("除外カテゴリは理由付きで不可", () => {
    expect(classifyFix(fix({ area: "正確性", quote: "導入の段落" }), BODY)).toEqual({
      applicable: false,
      reason: FIX_REASON_EXCLUDED,
    });
  });
  it("quote 無しは理由付きで不可", () => {
    expect(classifyFix(fix({ area: "文体", quote: "" }), BODY)).toEqual({
      applicable: false,
      reason: FIX_REASON_NO_QUOTE,
    });
  });
  it("本文に一致しない引用は要確認", () => {
    expect(classifyFix(fix({ area: "文体", quote: "存在しない文字列" }), BODY)).toEqual({
      applicable: false,
      reason: FIX_REASON_NO_ANCHOR,
    });
  });
});

describe("findAnchorBlock", () => {
  it("一意に含むブロックの index を返す", () => {
    expect(findAnchorBlock(BODY, "導入の段落")).toBe(1);
    expect(findAnchorBlock(BODY, "二つ目")).toBe(2);
  });
  it("空 quote / 0件 / 複数該当は -1", () => {
    expect(findAnchorBlock(BODY, "   ")).toBe(-1);
    expect(findAnchorBlock(BODY, "存在しない文字列")).toBe(-1);
    const dup = "<p>同じ段落</p><p>同じ段落</p>";
    expect(findAnchorBlock(dup, "同じ段落")).toBe(-1);
  });
});

describe("selectApplicableFixes", () => {
  it("quote 必須・反映可能カテゴリ・一意アンカーの fix だけ採用候補にする", () => {
    const fixes: AdviceFix[] = [
      fix({ area: "文体", quote: "導入の段落" }), // OK
      fix({ area: "文体" }), // quote 無し → 除外
      fix({ area: "正確性", quote: "二つ目" }), // 反映不可カテゴリ → 除外
      fix({ area: "読みやすさ", quote: "存在しない" }), // アンカー無し → 除外
    ];
    const got = selectApplicableFixes(fixes, BODY);
    expect(got).toHaveLength(1);
    expect(got[0]).toMatchObject({ index: 0, quote: "導入の段落", blockIndex: 1 });
  });
});

describe("parse/serialize ApplyProposal", () => {
  const item = { fixIndex: 0, before: "<p>A</p>", after: "<p>B</p>" };
  it("正常 JSON は items、壊れた JSON / スキーマ不一致は空配列", () => {
    expect(parseApplyProposal(JSON.stringify([item]))).toEqual([item]);
    expect(parseApplyProposal("{壊れ")).toEqual([]);
    expect(parseApplyProposal(JSON.stringify([{ fixIndex: "x" }]))).toEqual([]);
  });
  it("serialize は検証して文字列化、不正は throw", () => {
    expect(JSON.parse(serializeApplyProposal([item]))).toEqual([item]);
    expect(() => serializeApplyProposal([{ fixIndex: -1 }])).toThrow();
  });
  it("スキーマは上限件数を持つ", () => {
    expect(AdviceApplyProposalSchema.safeParse([]).success).toBe(true);
  });
});

describe("applyAdviceItem / applyAdviceItems", () => {
  it("before に一致するブロックを after で置換する", () => {
    const r = applyAdviceItem(BODY, {
      fixIndex: 0,
      before: "<p>これは導入の段落です。</p>",
      after: "<p>導入を読みやすく直しました。</p>",
    });
    expect(r.applied).toBe(true);
    expect(r.html).toContain("導入を読みやすく直しました。");
    expect(r.html).not.toContain("これは導入の段落です。");
  });
  it("一致0件は要確認で弾く", () => {
    const r = applyAdviceItem(BODY, { fixIndex: 0, before: "<p>無い段落</p>", after: "<p>x</p>" });
    expect(r.applied).toBe(false);
    expect(r.reason).toMatch(/見つかりません/);
  });
  it("一致複数は特定不能で弾く", () => {
    const dup = "<p>同じ</p><p>同じ</p>";
    const r = applyAdviceItem(dup, { fixIndex: 0, before: "<p>同じ</p>", after: "<p>x</p>" });
    expect(r.applied).toBe(false);
    expect(r.reason).toMatch(/複数/);
  });
  it("複数案を順に反映し、適用/スキップを返す", () => {
    const result = applyAdviceItems(BODY, [
      { fixIndex: 0, before: "<p>これは導入の段落です。</p>", after: "<p>新・導入。</p>" },
      { fixIndex: 1, before: "<p>無い段落</p>", after: "<p>x</p>" },
    ]);
    expect(result.applied).toEqual([0]);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].fixIndex).toBe(1);
    expect(result.html).toContain("新・導入。");
  });
});

describe("Notion props", () => {
  it("request はステータス依頼中＋採用fix JSON＋依頼時刻", () => {
    const props = buildApplyRequestProps(
      [{ index: 0, area: "文体", quote: "q", reason: "r", suggestion: "s", blockIndex: 1 }],
      "2026-06-24T00:00:00.000Z"
    );
    expect(props["アドバイス反映ステータス"]).toEqual({ select: { name: "依頼中" } });
    expect(props["アドバイス反映依頼時刻"]).toEqual({ date: { start: "2026-06-24T00:00:00.000Z" } });
  });
  it("processing/present/fail/clear のステータス遷移", () => {
    expect(buildApplyProcessingProps()["アドバイス反映ステータス"]).toEqual({ select: { name: "処理中" } });
    expect(buildApplyPresentProps("[]")["アドバイス反映ステータス"]).toEqual({ select: { name: "提示中" } });
    expect(buildApplyFailProps("理由")["アドバイス反映ステータス"]).toEqual({ select: { name: "失敗" } });
    expect(buildApplyClearProps()["アドバイス反映ステータス"]).toEqual({ select: { name: "なし" } });
  });
  it("定数の名前と busy 一覧", () => {
    expect(ADVISE_APPLY_PROPS.status).toBe("アドバイス反映ステータス");
    expect(ADVISE_APPLY_STATUSES).toContain("提示中");
    expect(ADVISE_APPLY_BUSY_STATUSES).toEqual(["依頼中", "処理中", "提示中"]);
  });
});

describe("読み取り(status/view/row/stale)", () => {
  it("applyStatusOf: 未設定/不正はなし", () => {
    expect(applyStatusOf(page({}))).toBe("なし");
    expect(applyStatusOf(page({ "アドバイス反映ステータス": { select: { name: "謎" } } }))).toBe("なし");
    expect(applyStatusOf(page({ "アドバイス反映ステータス": { select: { name: "処理中" } } }))).toBe("処理中");
  });
  it("applyViewOf: 提示中のみ案を解析、他は空", () => {
    const proposal = [{ fixIndex: 0, before: "<p>A</p>", after: "<p>B</p>" }];
    const presented = applyViewOf(
      page({
        "アドバイス反映ステータス": { select: { name: "提示中" } },
        "アドバイス反映案": { rich_text: [{ plain_text: JSON.stringify(proposal) }] },
      })
    );
    expect(presented.proposal).toEqual(proposal);
    const failed = applyViewOf(
      page({
        "アドバイス反映ステータス": { select: { name: "失敗" } },
        "アドバイス反映案": { rich_text: [{ plain_text: "理由" }] },
      })
    );
    expect(failed.proposal).toEqual([]);
    expect(failed.raw).toBe("理由");
  });
  it("applyRowFromPage: 行情報を取り出す", () => {
    const row = applyRowFromPage(
      page({
        "アドバイス反映ステータス": { select: { name: "依頼中" } },
        "アドバイス反映依頼時刻": { date: { start: "2026-06-24T00:00:00.000Z" } },
        "アドバイス反映指示": { rich_text: [{ plain_text: "[]" }] },
        "下書き本文HTML": { rich_text: [{ plain_text: "<p>本文</p>" }] },
      })
    );
    expect(row).toEqual({
      id: "i1",
      status: "依頼中",
      requestedAtMs: Date.parse("2026-06-24T00:00:00.000Z"),
      request: "[]",
      bodyHtml: "<p>本文</p>",
    });
  });
  it("applyRowFromPage: 欠落は空/null（日付プロパティ無し・plain_text欠落も空に）", () => {
    const row = applyRowFromPage(
      page({
        "アドバイス反映指示": { rich_text: [{}] }, // plain_text 欠落 → ""
        "下書き本文HTML": { rich_text: [{}] },
      })
    );
    expect(row.requestedAtMs).toBeNull(); // 日付プロパティ自体が無い
    expect(row.request).toBe("");
    expect(row.bodyHtml).toBe("");
  });

  it("applyRowFromPage: 不正な日付文字列は null", () => {
    const row = applyRowFromPage(page({ "アドバイス反映依頼時刻": { date: { start: "いつか" } } }));
    expect(row.requestedAtMs).toBeNull();
  });
  it("selectStaleApplyIds: 処理中で時間超過のみ", () => {
    const base = { request: "", bodyHtml: "" };
    const now = 1_000_000_000_000;
    const rows: AdviceApplyRow[] = [
      { id: "stale", status: "処理中", requestedAtMs: now - 16 * 60 * 1000, ...base },
      { id: "fresh", status: "処理中", requestedAtMs: now - 60 * 1000, ...base },
      { id: "noTime", status: "処理中", requestedAtMs: null, ...base },
      { id: "present", status: "提示中", requestedAtMs: now - 60 * 60 * 1000, ...base },
    ];
    expect(selectStaleApplyIds(rows, now, 15 * 60 * 1000)).toEqual(["stale"]);
  });
});
