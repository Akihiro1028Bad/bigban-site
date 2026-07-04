import { describe, expect, it } from "vitest";

import { BODY_IMAGE_STYLE_CHIPS, buildBodyRegenBody } from "./bodyRegenRequest";

const SRC = "https://images.microcms-assets.io/assets/a/1.png";

describe("BODY_IMAGE_STYLE_CHIPS", () => {
  it("先頭はおまかせ(auto)で6択ある", () => {
    expect(BODY_IMAGE_STYLE_CHIPS).toHaveLength(6);
    expect(BODY_IMAGE_STYLE_CHIPS[0].key).toBe("auto");
    expect(BODY_IMAGE_STYLE_CHIPS.map((c) => c.key)).toEqual([
      "auto",
      "mascot",
      "illust",
      "court",
      "flow",
      "infographic",
    ]);
  });
});

describe("buildBodyRegenBody", () => {
  it("src target のとき style/textSpec/instruction を含む送信 body を組む", () => {
    const body = buildBodyRegenBody("i1", { kind: "src", targetSrc: SRC }, {
      style: "court",
      instruction: "コート図で",
      textSpec: "13.41m x 6.10m",
    });
    expect(body).toEqual({
      pageId: "i1",
      targetSrc: SRC,
      style: "court",
      textSpec: "13.41m x 6.10m",
      instruction: "コート図で",
    });
  });

  it("auto/空文字もそのまま送る(API 側で解釈)", () => {
    const body = buildBodyRegenBody("i1", { kind: "src", targetSrc: SRC }, { style: "auto", instruction: "", textSpec: "" });
    expect(body).toEqual({ pageId: "i1", targetSrc: SRC, style: "auto", textSpec: "", instruction: "" });
  });

  it("placeholder target のとき placeholderId を送る", () => {
    const body = buildBodyRegenBody("i1", { kind: "placeholder", placeholderId: "img-123e4567-e89b-12d3-a456-426614174000" }, {
      style: "mascot",
      instruction: "明るい雰囲気",
      textSpec: "BIGBAN",
    });
    expect(body).toEqual({
      pageId: "i1",
      placeholderId: "img-123e4567-e89b-12d3-a456-426614174000",
      style: "mascot",
      textSpec: "BIGBAN",
      instruction: "明るい雰囲気",
    });
  });
});
