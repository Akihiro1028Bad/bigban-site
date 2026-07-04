// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  IMAGE_STYLES,
  imageStyleKeyFromLabel,
  parseImageDirectives,
  parseOutlineSections,
  serializeImageDirective,
  serializeOutlineSections,
} from "./outline";

describe("parseOutlineSections", () => {
  it("見出し＋説明のセクションを分割する(空行区切り)", () => {
    const outline = "## 市川でできる場所は3つ\n屋外/体育館/屋内専用を整理\n\n## 屋内専用という選び方\n天候に左右されない利点";
    expect(parseOutlineSections(outline)).toEqual([
      { heading: "市川でできる場所は3つ", description: "屋外/体育館/屋内専用を整理", images: [] },
      { heading: "屋内専用という選び方", description: "天候に左右されない利点", images: [] },
    ]);
  });

  it("見出しのみ(説明なし)も扱う", () => {
    expect(parseOutlineSections("## A\n## B")).toEqual([
      { heading: "A", description: "", images: [] },
      { heading: "B", description: "", images: [] },
    ]);
  });

  it("旧フォーマット(#なしの行)は見出しのみセクションに落とす", () => {
    expect(parseOutlineSections("導入\n本論\nまとめ")).toEqual([
      { heading: "導入", description: "", images: [] },
      { heading: "本論", description: "", images: [] },
      { heading: "まとめ", description: "", images: [] },
    ]);
  });

  it("説明が複数行ならスペースで結合する", () => {
    expect(parseOutlineSections("## A\n行1\n行2")).toEqual([
      { heading: "A", description: "行1 行2", images: [] },
    ]);
  });

  it("見出し前の行は見出しのみセクション、以降は説明に入る", () => {
    expect(parseOutlineSections("前文\n## A\n説明")).toEqual([
      { heading: "前文", description: "", images: [] },
      { heading: "A", description: "説明", images: [] },
    ]);
  });

  it("旧フォーマットで見出し前に複数の#なし行が並ぶと、各行が独立セクションになる", () => {
    expect(parseOutlineSections("前文\n補足\n## A\n説明")).toEqual([
      { heading: "前文", description: "", images: [] },
      { heading: "補足", description: "", images: [] },
      { heading: "A", description: "説明", images: [] },
    ]);
  });

  it("### など深い見出しもマーカーを外す。空行は無視・空文字は []", () => {
    expect(parseOutlineSections("###  深い見出し")).toEqual([
      { heading: "深い見出し", description: "", images: [] },
    ]);
    expect(parseOutlineSections("\n\n")).toEqual([]);
    expect(parseOutlineSections("")).toEqual([]);
  });

  it("画像指示だけの行は説明に混ぜず images[] に振り分ける", () => {
    const outline =
      "## キッチンの基本\nネット手前のゾーンの説明。\n[画像:コート図・ルール図解: キッチンとサーブ位置の関係]";
    expect(parseOutlineSections(outline)).toEqual([
      {
        heading: "キッチンの基本",
        description: "ネット手前のゾーンの説明。",
        images: [{ style: "court", description: "キッチンとサーブ位置の関係" }],
      },
    ]);
  });

  it("1セクションに複数画像・説明と画像の混在を扱える", () => {
    const outline =
      "## 道具\n手ぶらでOK。\n[画像:宇宙人マスコット: 宇宙人がパドルを構える]\n[画像:雰囲気イラスト: パドルの握り方]";
    expect(parseOutlineSections(outline)).toEqual([
      {
        heading: "道具",
        description: "手ぶらでOK。",
        images: [
          { style: "mascot", description: "宇宙人がパドルを構える" },
          { style: "illust", description: "パドルの握り方" },
        ],
      },
    ]);
  });

  it("不正スタイル名の画像指示は採用せず、通常テキスト(説明)として残す", () => {
    const outline = "## A\n[画像:存在しないスタイル: 何か]";
    expect(parseOutlineSections(outline)).toEqual([
      { heading: "A", description: "[画像:存在しないスタイル: 何か]", images: [] },
    ]);
  });

  it("説明が空の画像指示は採用せず、通常テキストとして残す", () => {
    const outline = "## A\n[画像:コート図・ルール図解: ]";
    expect(parseOutlineSections(outline)).toEqual([
      { heading: "A", description: "[画像:コート図・ルール図解: ]", images: [] },
    ]);
  });

  it("見出し前に現れた画像指示行は見出しのみセクションに落とす(現在セクション無し)", () => {
    expect(parseOutlineSections("[画像:コート図・ルール図解: 図]")).toEqual([
      { heading: "[画像:コート図・ルール図解: 図]", description: "", images: [] },
    ]);
  });

  it("テキストと画像トークンが同一行に混在する場合は行全体を説明として残す(画像化しない)", () => {
    const outline = "## A\n補足 [画像:コート図・ルール図解: 図]";
    const sections = parseOutlineSections(outline);
    expect(sections).toEqual([
      { heading: "A", description: "補足 [画像:コート図・ルール図解: 図]", images: [] },
    ]);
    // 混在行は serialize→parse でも安定(往復で崩れない)。
    expect(parseOutlineSections(serializeOutlineSections(sections))).toEqual(sections);
  });

  it("[画像:なし] 単独行は suppressImage=true とし images[] に積まない", () => {
    expect(parseOutlineSections("## A\n[画像:なし]")).toEqual([
      { heading: "A", description: "", images: [], suppressImage: true },
    ]);
  });

  it("記法なしセクションは suppressImage 未設定のまま images[] 空で区別する", () => {
    expect(parseOutlineSections("## A\n説明")).toEqual([
      { heading: "A", description: "説明", images: [] },
    ]);
  });
});

describe("parseImageDirectives / serializeImageDirective", () => {
  it("6スタイルすべてで 表示名↔キー を往復できる", () => {
    for (const { key, label } of IMAGE_STYLES) {
      expect(imageStyleKeyFromLabel(label)).toBe(key);
      const token = serializeImageDirective({ style: key, description: "説明" });
      expect(token).toBe(`[画像:${label}: 説明]`);
      expect(parseImageDirectives(token)).toEqual([{ style: key, description: "説明" }]);
    }
  });

  it("textSpec 付き新記法を parse し、全角区切り・全角コロンも許容する", () => {
    expect(parseImageDirectives("[画像:コート図・ルール図解: 説明 | 文字: A/B]")).toEqual([
      { style: "court", description: "説明", textSpec: "A/B" },
    ]);
    expect(parseImageDirectives("[画像：手順・フロー図：  説明  ｜ 文字： 1→2 ]")).toEqual([
      { style: "flow", description: "説明", textSpec: "1→2" },
    ]);
  });

  it("textSpec なしトークンは textSpec undefined、空 textSpec は省略する", () => {
    expect(parseImageDirectives("[画像:比較・インフォグラフィック: 比較]")).toEqual([
      { style: "infographic", description: "比較" },
    ]);
    expect(parseImageDirectives("[画像:比較・インフォグラフィック: 比較 | 文字: ]")).toEqual([
      { style: "infographic", description: "比較" },
    ]);
  });

  it("court/flow/infographic 以外の textSpec も parse は受理する", () => {
    expect(parseImageDirectives("[画像:宇宙人マスコット: 案内 | 文字: OPEN]")).toEqual([
      { style: "mascot", description: "案内", textSpec: "OPEN" },
    ]);
  });

  it("全角コロンも許容し、前後空白を整える", () => {
    expect(parseImageDirectives("[画像：コート図・ルール図解：  コート図  ]")).toEqual([
      { style: "court", description: "コート図" },
    ]);
  });

  it("不正スタイル名・説明空は採用しない", () => {
    expect(parseImageDirectives("[画像:なぞ: x]")).toEqual([]);
    expect(parseImageDirectives("[画像:コート図・ルール図解: ]")).toEqual([]);
  });

  it("未知の表示名は null", () => {
    expect(imageStyleKeyFromLabel("なぞスタイル")).toBeNull();
    expect(imageStyleKeyFromLabel("なし")).toBeNull();
  });

  it("旧3表示名は後方互換で新キーへマップし、書き出しは新表示名に正規化する", () => {
    expect(parseImageDirectives("[画像:マスコット・コスミック: 宇宙人]")).toEqual([
      { style: "mascot", description: "宇宙人" },
    ]);
    expect(parseImageDirectives("[画像:ミニマル図解: 雰囲気]")).toEqual([
      { style: "illust", description: "雰囲気" },
    ]);
    expect(parseImageDirectives("[画像:詳しい図解: 図]")).toEqual([
      { style: "court", description: "図" },
    ]);

    expect(serializeOutlineSections(parseOutlineSections("## A\n[画像:詳しい図解: 図]"))).toBe(
      "## A\n[画像:コート図・ルール図解: 図]"
    );
  });

  it("serialize は textSpec を trim して半角区切りで出力し、未指定なら付けない", () => {
    expect(
      serializeImageDirective({
        style: "court",
        description: " 俯瞰でコートの区画を示す ",
        textSpec: " 幅6.1m/長さ13.4m ",
      })
    ).toBe("[画像:コート図・ルール図解: 俯瞰でコートの区画を示す | 文字: 幅6.1m/長さ13.4m]");
    expect(serializeImageDirective({ style: "court", description: "図", textSpec: "  " })).toBe(
      "[画像:コート図・ルール図解: 図]"
    );
  });

  it("parse→serialize→parse で 6語彙 × textSpec あり/なしが不変", () => {
    for (const { key, label } of IMAGE_STYLES) {
      const withTextSpec = `## A\n[画像:${label}: 説明 | 文字: 表示文字]`;
      const withoutTextSpec = `## A\n[画像:${label}: 説明]`;
      expect(parseOutlineSections(serializeOutlineSections(parseOutlineSections(withTextSpec)))).toEqual(
        parseOutlineSections(withTextSpec)
      );
      expect(parseOutlineSections(serializeOutlineSections(parseOutlineSections(withoutTextSpec)))).toEqual(
        parseOutlineSections(withoutTextSpec)
      );
      expect(parseOutlineSections(withTextSpec)[0].images[0].style).toBe(key);
    }
  });
});

describe("serializeOutlineSections", () => {
  it("見出し＋説明を `## 見出し` ＋説明行・空行区切りに戻す", () => {
    expect(
      serializeOutlineSections([
        { heading: "A", description: "説明A", images: [] },
        { heading: "B", description: "", images: [] },
      ])
    ).toBe("## A\n説明A\n\n## B");
  });

  it("画像指示を見出し→説明→画像の順に出力する", () => {
    expect(
      serializeOutlineSections([
        {
          heading: "A",
          description: "説明A",
          images: [
            { style: "court", description: "図1" },
            { style: "mascot", description: "宇宙人" },
          ],
        },
      ])
    ).toBe("## A\n説明A\n[画像:コート図・ルール図解: 図1]\n[画像:宇宙人マスコット: 宇宙人]");
  });

  it("説明なし＋画像ありなら見出し直後に画像行を出す", () => {
    expect(
      serializeOutlineSections([
        { heading: "A", description: "", images: [{ style: "illust", description: "握り方" }] },
      ])
    ).toBe("## A\n[画像:雰囲気イラスト: 握り方]");
  });

  it("suppressImage=true なら [画像:なし] を1行出す", () => {
    expect(
      serializeOutlineSections([
        { heading: "A", description: "説明", images: [], suppressImage: true },
      ])
    ).toBe("## A\n説明\n[画像:なし]");
  });

  it("parse と往復できる(正規化後・画像込み)", () => {
    const text =
      "## A\n説明A\n[画像:コート図・ルール図解: 図1 | 文字: A/B]\n\n## B\n説明B\n[画像:なし]";
    expect(serializeOutlineSections(parseOutlineSections(text))).toBe(text);
  });
});
