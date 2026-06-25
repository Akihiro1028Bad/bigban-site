// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  anchorExists,
  BODY_COMMENT_BUSY_STATUSES,
  BODY_COMMENT_PROPS,
  bodyCommentStatusOf,
  bodyCommentViewOf,
  buildBodyCommentClearProps,
  buildBodyCommentRequestProps,
  extractReviewLines,
  MAX_BODY_COMMENTS,
  parseBodyComments,
  selectAnchoredComments,
  serializeBodyComments,
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

describe("Notion props / status / view", () => {
  it("依頼プロパティ: 指示(JSON)・結果クリア・依頼中・依頼時刻", () => {
    const c: BodyComment = { blockIndex: 1, excerpt: "一文目です。", comment: "やわらかく" };
    const props = buildBodyCommentRequestProps([c], "2026-06-25T00:00:00.000Z");
    const status = props[BODY_COMMENT_PROPS.status] as { select: { name: string } };
    expect(status.select.name).toBe("依頼中");
    const reqText = (props[BODY_COMMENT_PROPS.request] as { rich_text: Array<{ text: { content: string } }> })
      .rich_text.map((r) => r.text.content)
      .join("");
    expect(JSON.parse(reqText)).toEqual([c]);
    expect(props[BODY_COMMENT_PROPS.requestedAt]).toEqual({ date: { start: "2026-06-25T00:00:00.000Z" } });
  });
  it("クリアプロパティ: なし＋指示/結果を空に", () => {
    const props = buildBodyCommentClearProps();
    expect((props[BODY_COMMENT_PROPS.status] as { select: { name: string } }).select.name).toBe("なし");
    expect(props[BODY_COMMENT_PROPS.request]).toEqual({ rich_text: [] });
  });
  it("busy ステータスは依頼中/処理中/提示中", () => {
    expect(BODY_COMMENT_BUSY_STATUSES).toEqual(["依頼中", "処理中", "提示中"]);
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
    expect(view).toEqual({ status: "なし", comments: [], raw: "" });
  });
  it("ビュー: rich_text の plain_text 欠落も空文字として扱う", () => {
    const p = page({ [BODY_COMMENT_PROPS.result]: { rich_text: [{}] } });
    expect(bodyCommentViewOf(p).raw).toBe("");
  });
});
