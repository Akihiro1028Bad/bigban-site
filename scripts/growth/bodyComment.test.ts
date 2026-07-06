// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  anchorExists,
  applyBodyCommentItem,
  applyBodyCommentProposal,
  BODY_COMMENT_TIMEOUT_MS,
  bodyCommentRowFromPage,
  selectStaleBodyCommentIds,
  BODY_COMMENT_PROPS,
  BODY_COMMENT_BUSY_STATUSES,
  BodyCommentRequestSchema,
  bodyCommentStatusOf,
  bodyCommentViewOf,
  buildBodyCommentClearProps,
  buildBodyCommentFailProps,
  buildBodyCommentPresentProps,
  buildBodyCommentProcessingProps,
  buildBodyCommentRequestProps,
  extractReviewLines,
  MAX_BODY_COMMENTS,
  OVERALL_COMMENT_MAX_BLOCKS,
  parseBodyComments,
  parseBodyCommentRequest,
  parseBodyCommentProposal,
  selectAnchoredComments,
  serializeBodyComments,
  serializeBodyCommentProposal,
  splitSentences,
  type BodyComment,
} from "./bodyComment";
import type { NotionPage } from "./notion";

const BODY =
  "<h2>見出しです。</h2>" +
  "<p>一文目です。二文目もあります。</p>" +
  '<figure><img src="x.png" alt="a"></figure>' +
  "<p>三つ目の段落。</p>";

function page(props: Record<string, unknown>): NotionPage {
  return { id: "i1", url: "", properties: props };
}

describe("splitSentences", () => {
  it("。！？ で文に分割し、区切り文字を含める", () => {
    expect(splitSentences("一つ目。二つ目！三つ目？")).toEqual(["一つ目。", "二つ目！", "三つ目？"]);
  });
  it("末尾に区切りが無い文も拾い、空文は捨てる", () => {
    expect(splitSentences("区切り無し")).toEqual(["区切り無し"]);
    expect(splitSentences("  。  ")).toEqual(["。"]);
    expect(splitSentences("   ")).toEqual([]);
  });
});

describe("extractReviewLines", () => {
  it("テキストブロックは文ごと、非テキストは塊1行(コメント不可)にする", () => {
    const lines = extractReviewLines(BODY);
    expect(lines.map((l) => l.text)).toEqual([
      "見出しです。",
      "一文目です。",
      "二文目もあります。",
      "［画像］",
      "三つ目の段落。",
    ]);
    const fig = lines.find((l) => l.tag === "figure")!;
    expect(fig.commentable).toBe(false);
    expect(fig.excerpt).toBeNull();
    const sentence = lines.find((l) => l.text === "一文目です。")!;
    expect(sentence).toMatchObject({ blockIndex: 1, commentable: true, excerpt: "一文目です。" });
  });

  it("非テキストブロックのラベルを種別ごと＋既定で付ける", () => {
    const labels = extractReviewLines(
      "<table><tr><td>x</td></tr></table>" +
        "<ul><li>a</li></ul>" +
        "<ol><li>b</li></ol>" +
        '<img src="x.png" alt="y">' +
        '<div class="cta">c</div>' +
        '<a class="embed">d</a>'
    ).map((l) => l.text);
    expect(labels).toEqual(["［表］", "［リスト］", "［リスト］", "［画像］", "［div］", "［a］"]);
  });
});

describe("anchorExists", () => {
  it("blockIndex のブロックに一意に存在すれば true", () => {
    expect(anchorExists(BODY, 1, "一文目です。")).toBe(true);
  });
  it("空 / 別ブロック / 不在は false", () => {
    expect(anchorExists(BODY, 1, "  ")).toBe(false);
    expect(anchorExists(BODY, 0, "一文目です。")).toBe(false);
    expect(anchorExists(BODY, 1, "存在しない文。")).toBe(false);
  });
  it("同一文が複数あれば一意でないので false", () => {
    const dup = "<p>同じ文。</p><p>同じ文。</p>";
    // blockIndex 0 のブロック内に「同じ文。」は1つだが、別ブロックにも同文 → ブロック内一意判定で true
    expect(anchorExists(dup, 0, "同じ文。")).toBe(true);
    // 同一ブロック内に重複させると一意でない
    const dupInBlock = "<p>同じ文。同じ文。</p>";
    expect(anchorExists(dupInBlock, 0, "同じ文。")).toBe(false);
  });
});

describe("parse/serialize/select", () => {
  const c: BodyComment = { blockIndex: 1, excerpt: "一文目です。", comment: "やわらかく" };
  it("正常 JSON は配列、壊れた JSON / スキーマ不一致は空配列", () => {
    expect(parseBodyComments(JSON.stringify([c]))).toEqual([c]);
    expect(parseBodyComments("{壊れ")).toEqual([]);
    expect(parseBodyComments(JSON.stringify([{ blockIndex: -1 }]))).toEqual([]);
    expect(parseBodyComments(JSON.stringify([]))).toEqual([]);
  });
  it("serialize は検証して文字列化、不正は throw", () => {
    expect(JSON.parse(serializeBodyComments([c]))).toEqual([c]);
    expect(() => serializeBodyComments([{ blockIndex: 0, excerpt: "", comment: "x" }])).toThrow();
  });
  it("上限件数を持つ", () => {
    const many = Array.from({ length: MAX_BODY_COMMENTS + 1 }, () => c);
    expect(() => serializeBodyComments(many)).toThrow();
  });
  it("selectAnchoredComments はアンカーできるものだけ残す", () => {
    const ok = { blockIndex: 1, excerpt: "一文目です。", comment: "a" };
    const ng = { blockIndex: 1, excerpt: "存在しない。", comment: "b" };
    expect(selectAnchoredComments([ok, ng], BODY)).toEqual([ok]);
  });
});

describe("BodyCommentRequestSchema", () => {
  const c: BodyComment = { blockIndex: 0, excerpt: "x。", comment: "y" };

  it("comments のみを受け付ける", () => {
    expect(BodyCommentRequestSchema.safeParse({ comments: [c] }).success).toBe(true);
  });

  it("overall のみを受け付け、comments は空配列を既定値にする", () => {
    const parsed = BodyCommentRequestSchema.parse({ overall: "全体にヘッジが多い" });
    expect(parsed).toEqual({ comments: [], overall: "全体にヘッジが多い" });
  });

  it("comments と overall の併用も受け付ける", () => {
    expect(BodyCommentRequestSchema.safeParse({ comments: [c], overall: "全体も見る" }).success).toBe(true);
  });

  it("overall 空文字は拒否する", () => {
    expect(BodyCommentRequestSchema.safeParse({ overall: "" }).success).toBe(false);
  });

  it("comments が上限を超えたら拒否する", () => {
    const many = Array.from({ length: MAX_BODY_COMMENTS + 1 }, () => c);
    expect(BodyCommentRequestSchema.safeParse({ comments: many }).success).toBe(false);
  });
});

describe("parseBodyCommentRequest", () => {
  const c: BodyComment = { blockIndex: 0, excerpt: "x。", comment: "y" };

  it("旧形の配列 JSON を comments に読み替える", () => {
    expect(parseBodyCommentRequest(JSON.stringify([c]))).toEqual({ comments: [c], overall: undefined });
  });

  it("オブジェクト JSON を復元する", () => {
    expect(parseBodyCommentRequest(JSON.stringify({ comments: [c], overall: "z" }))).toEqual({
      comments: [c],
      overall: "z",
    });
  });

  it("overall のみを復元する", () => {
    expect(parseBodyCommentRequest(JSON.stringify({ overall: "z" }))).toEqual({ comments: [], overall: "z" });
  });

  it("壊れた JSON は安全側の空依頼にする", () => {
    expect(parseBodyCommentRequest("{壊")).toEqual({ comments: [], overall: undefined });
  });

  it("スキーマ不一致は安全側の空依頼にする", () => {
    expect(parseBodyCommentRequest(JSON.stringify({ comments: [{ blockIndex: -1 }] }))).toEqual({
      comments: [],
      overall: undefined,
    });
  });
});

describe("反映案 parse/serialize/apply (Phase 2)", () => {
  const item = {
    commentIndex: 0,
    before: "<p>一文目です。二文目もあります。</p>",
    after: "<p>一文目だよ。二文目もあります。</p>",
  };
  it("正常 JSON は配列、壊れ/不一致は空配列", () => {
    expect(parseBodyCommentProposal(JSON.stringify([item]))).toEqual([item]);
    expect(parseBodyCommentProposal("{壊れ")).toEqual([]);
    expect(parseBodyCommentProposal(JSON.stringify([{ commentIndex: -1 }]))).toEqual([]);
  });
  it("serialize は検証して文字列化、不正は throw", () => {
    expect(JSON.parse(serializeBodyCommentProposal([item]))).toEqual([item]);
    expect(() => serializeBodyCommentProposal([{ commentIndex: 0, before: "", after: "x" }])).toThrow();
  });
  it("applyBodyCommentItem: before 一致ブロックを after で置換", () => {
    const res = applyBodyCommentItem(BODY, item);
    expect(res.applied).toBe(true);
    expect(res.html).toContain("一文目だよ。");
    expect(res.html).not.toContain("<p>一文目です。二文目もあります。</p>");
  });
  it("applyBodyCommentItem: 0件/複数は弾く(要確認)", () => {
    expect(applyBodyCommentItem(BODY, { ...item, before: "<p>無い段落。</p>" }).applied).toBe(false);
    const dup = "<p>同じ。</p><p>同じ。</p>";
    expect(applyBodyCommentItem(dup, { commentIndex: 0, before: "<p>同じ。</p>", after: "<p>新。</p>" }).applied).toBe(
      false
    );
  });
  it("applyBodyCommentProposal: 反映可は applied、不可は skipped に理由付き", () => {
    const ng = { commentIndex: 1, before: "<p>無い。</p>", after: "<p>x。</p>" };
    const res = applyBodyCommentProposal(BODY, [item, ng]);
    expect(res.applied).toEqual([0]);
    expect(res.skipped[0].commentIndex).toBe(1);
    expect(res.skipped[0].reason).toContain("要確認");
  });
});

describe("Notion props / status / view", () => {
  it("依頼プロパティ: 指示(JSON)・結果クリア・依頼中・依頼時刻", () => {
    const c: BodyComment = { blockIndex: 1, excerpt: "一文目です。", comment: "やわらかく" };
    const props = buildBodyCommentRequestProps({ comments: [c] }, "2026-06-25T00:00:00.000Z");
    const status = props[BODY_COMMENT_PROPS.status] as { select: { name: string } };
    expect(status.select.name).toBe("依頼中");
    const reqText = (props[BODY_COMMENT_PROPS.request] as { rich_text: Array<{ text: { content: string } }> })
      .rich_text.map((r) => r.text.content)
      .join("");
    expect(JSON.parse(reqText)).toEqual({ comments: [c] });
    expect(props[BODY_COMMENT_PROPS.requestedAt]).toEqual({ date: { start: "2026-06-25T00:00:00.000Z" } });
  });
  it("依頼プロパティ: overall だけをオブジェクト JSON として書く", () => {
    const props = buildBodyCommentRequestProps({ comments: [], overall: "全体コメント" }, "2026-06-25T00:00:00.000Z");
    const status = props[BODY_COMMENT_PROPS.status] as { select: { name: string } };
    expect(status.select.name).toBe("依頼中");
    const reqText = (props[BODY_COMMENT_PROPS.request] as { rich_text: Array<{ text: { content: string } }> })
      .rich_text.map((r) => r.text.content)
      .join("");
    expect(JSON.parse(reqText)).toEqual({ comments: [], overall: "全体コメント" });
    expect(props[BODY_COMMENT_PROPS.requestedAt]).toEqual({ date: { start: "2026-06-25T00:00:00.000Z" } });
  });
  it("依頼プロパティ: comments だけなら overall キーを持たない", () => {
    const c: BodyComment = { blockIndex: 1, excerpt: "一文目です。", comment: "やわらかく" };
    const props = buildBodyCommentRequestProps({ comments: [c] }, "2026-06-25T00:00:00.000Z");
    const reqText = (props[BODY_COMMENT_PROPS.request] as { rich_text: Array<{ text: { content: string } }> })
      .rich_text.map((r) => r.text.content)
      .join("");
    expect(JSON.parse(reqText)).toEqual({ comments: [c] });
    expect(reqText).not.toContain("overall");
  });
  it("OVERALL_COMMENT_MAX_BLOCKS は 10", () => {
    expect(OVERALL_COMMENT_MAX_BLOCKS).toBe(10);
  });
  it("クリアプロパティ: なし＋指示/結果を空に", () => {
    const props = buildBodyCommentClearProps();
    expect((props[BODY_COMMENT_PROPS.status] as { select: { name: string } }).select.name).toBe("なし");
    expect(props[BODY_COMMENT_PROPS.request]).toEqual({ rich_text: [] });
  });
  it("busy ステータスは依頼中/処理中/提示中", () => {
    expect(BODY_COMMENT_BUSY_STATUSES).toEqual(["依頼中", "処理中", "提示中"]);
  });
  it("processing/present/fail プロパティ(Phase 2)", () => {
    expect(
      (buildBodyCommentProcessingProps()[BODY_COMMENT_PROPS.status] as { select: { name: string } }).select.name
    ).toBe("処理中");
    const present = buildBodyCommentPresentProps('[{"commentIndex":0,"before":"a","after":"b"}]');
    expect((present[BODY_COMMENT_PROPS.status] as { select: { name: string } }).select.name).toBe("提示中");
    expect(
      (present[BODY_COMMENT_PROPS.result] as { rich_text: Array<{ text: { content: string } }> }).rich_text
        .map((r) => r.text.content)
        .join("")
    ).toContain("commentIndex");
    const fail = buildBodyCommentFailProps("タイムアウト");
    expect((fail[BODY_COMMENT_PROPS.status] as { select: { name: string } }).select.name).toBe("失敗");
    expect(
      (fail[BODY_COMMENT_PROPS.result] as { rich_text: Array<{ text: { content: string } }> }).rich_text
        .map((r) => r.text.content)
        .join("")
    ).toBe("タイムアウト");
  });
  it("ステータス読み取り: 未設定/想定外は なし", () => {
    expect(bodyCommentStatusOf(page({}))).toBe("なし");
    expect(bodyCommentStatusOf(page({ [BODY_COMMENT_PROPS.status]: { select: { name: "提示中" } } }))).toBe(
      "提示中"
    );
    expect(bodyCommentStatusOf(page({ [BODY_COMMENT_PROPS.status]: { select: { name: "謎" } } }))).toBe("なし");
  });
  it("ビュー: ステータス＋投稿済みコメント＋生テキスト", () => {
    const c: BodyComment = { blockIndex: 1, excerpt: "一文目です。", comment: "やわらかく" };
    const p = page({
      [BODY_COMMENT_PROPS.status]: { select: { name: "提示中" } },
      [BODY_COMMENT_PROPS.request]: { rich_text: [{ plain_text: JSON.stringify([c]) }] },
      [BODY_COMMENT_PROPS.result]: { rich_text: [{ plain_text: "理由テキスト" }] },
    });
    const view = bodyCommentViewOf(p);
    expect(view.status).toBe("提示中");
    expect(view.comments).toEqual([c]);
    expect(view.raw).toBe("理由テキスト");
  });
  it("ビュー: プロパティ欠落でも落ちず なし/空 を返す", () => {
    const view = bodyCommentViewOf(page({}));
    expect(view).toEqual({ status: "なし", comments: [], proposal: [], raw: "" });
  });

  it("ビュー: 提示中は before/after 案も解析して返す", () => {
    const proposal = [{ commentIndex: 0, before: "<p>A。</p>", after: "<p>B。</p>" }];
    const p = page({
      [BODY_COMMENT_PROPS.status]: { select: { name: "提示中" } },
      [BODY_COMMENT_PROPS.result]: { rich_text: [{ plain_text: JSON.stringify(proposal) }] },
    });
    expect(bodyCommentViewOf(p).proposal).toEqual(proposal);
  });
  it("ビュー: rich_text の plain_text 欠落も空文字として扱う", () => {
    const p = page({ [BODY_COMMENT_PROPS.result]: { rich_text: [{}] } });
    expect(bodyCommentViewOf(p).raw).toBe("");
  });
});

describe("PC ループ用 row / stale 回収", () => {
  it("bodyCommentRowFromPage: id/status/依頼時刻/request/本文を読む", () => {
    const c: BodyComment = { blockIndex: 0, excerpt: "一文目です。", comment: "x" };
    const p = page({
      [BODY_COMMENT_PROPS.status]: { select: { name: "依頼中" } },
      [BODY_COMMENT_PROPS.request]: { rich_text: [{ plain_text: JSON.stringify([c]) }] },
      [BODY_COMMENT_PROPS.requestedAt]: { date: { start: "2026-06-25T00:00:00.000Z" } },
      下書き本文HTML: { rich_text: [{ plain_text: "<p>本文。</p>" }] },
    });
    const row = bodyCommentRowFromPage(p);
    expect(row).toMatchObject({
      id: "i1",
      status: "依頼中",
      requestedAtMs: Date.parse("2026-06-25T00:00:00.000Z"),
      bodyHtml: "<p>本文。</p>",
    });
    expect(JSON.parse(row.request)).toEqual([c]);
  });
  it("依頼時刻が無効/欠落なら requestedAtMs は null", () => {
    expect(bodyCommentRowFromPage(page({})).requestedAtMs).toBeNull();
    expect(
      bodyCommentRowFromPage(page({ [BODY_COMMENT_PROPS.requestedAt]: { date: { start: "壊れ" } } }))
        .requestedAtMs
    ).toBeNull();
  });
  it("selectStaleBodyCommentIds: 処理中・依頼中の超過のみ回収し提示中は回収しない(#H29)", () => {
    const now = 1_000_000_000_000;
    const base = { request: "", bodyHtml: "" };
    const rows = [
      { id: "old", status: "処理中" as const, requestedAtMs: now - BODY_COMMENT_TIMEOUT_MS - 1, ...base },
      { id: "pending", status: "依頼中" as const, requestedAtMs: now - BODY_COMMENT_TIMEOUT_MS - 1, ...base },
      { id: "present", status: "提示中" as const, requestedAtMs: now - BODY_COMMENT_TIMEOUT_MS - 1, ...base },
      { id: "fresh", status: "処理中" as const, requestedAtMs: now - 1000, ...base },
      { id: "none", status: "処理中" as const, requestedAtMs: null, ...base },
    ];
    expect(selectStaleBodyCommentIds(rows, now, BODY_COMMENT_TIMEOUT_MS)).toEqual(["old", "pending"]);
  });
});
