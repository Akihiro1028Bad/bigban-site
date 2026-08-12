import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { setMockReducedMotion } from "../../../__mocks__/framer-motion";
import jaMessages from "../../../messages/ja.json";
import HomeConcept from "./HomeConcept";

const copy = jaMessages.HomeConcept;

function renderConcept() {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      <HomeConcept />
    </NextIntlClientProvider>
  );
}

/**
 * キャッチコピーは折り返し単位ごとに span で包むため、直下のテキストノードだけを
 * 見る getByText では拾えない。要素全体の textContent で引く。
 */
function getCatchcopy() {
  return screen.getByText(
    (_content, element) =>
      element?.tagName === "P" && element.textContent === copy.catchcopy
  );
}

describe("HomeConcept", () => {
  beforeEach(() => {
    setMockReducedMotion(false);
  });

  it('セクションID "concept" を持つ', () => {
    renderConcept();
    const section = document.getElementById("concept");
    expect(section).toBeInTheDocument();
  });

  it("章の縦リズム py-16 lg:py-24 を持つ（主要セクション共通）", () => {
    renderConcept();
    const section = document.getElementById("concept");
    expect(section?.className).toContain("py-16");
    expect(section?.className).toContain("lg:py-24");
  });

  it("見出し下線は画面内で中央から伸びる SectionUnderline に置き換わっている", () => {
    const { container } = renderConcept();
    // 色・太さ・幅は据え置き、scaleX の起点だけ中央に付く。
    const underline = container.querySelector(".w-14");
    const classes = underline?.className.split(/\s+/) ?? [];
    expect(classes).toContain("bg-accent");
    expect(classes).toContain("h-[3px]");
    expect(classes).toContain("origin-center");
  });

  it("CONCEPTタイトルを表示する", () => {
    renderConcept();
    expect(screen.getByText("CONCEPT")).toBeInTheDocument();
  });

  it("日本語サブタイトル「コンセプト」を表示する", () => {
    renderConcept();
    expect(screen.getByText("コンセプト")).toBeInTheDocument();
  });

  it("リードコピーを表示する", () => {
    renderConcept();
    expect(screen.getByText(/ビッグバンによって誕生したように/)).toBeInTheDocument();
  });

  it("詩的な行を英数字の1で表示する", () => {
    renderConcept();
    expect(screen.getByText("1つの小さなプレー。")).toBeInTheDocument();
    expect(screen.getByText("1つの小さなディンク。")).toBeInTheDocument();
  });

  it("説明テキストを表示する", () => {
    renderConcept();
    expect(screen.getByText(/やがて大きなエネルギーとなり/)).toBeInTheDocument();
  });

  it("キャッチコピーを表示する", () => {
    renderConcept();
    expect(getCatchcopy()).toBeInTheDocument();
  });

  it("ビッグバン画像を星雲の背景として敷き、装飾として支援技術から隠す", () => {
    renderConcept();
    // 背景に沈めた星雲は本文の意味を担わないため alt="" の装飾画像にする。
    const img = document.querySelector("#concept img");
    expect(img).toHaveAttribute("alt", "");
    // 章の見せ場は星雲。レイアウトとタイポを普通にした分、背景は存在感を残す。
    expect(img?.className).toContain("opacity-40");
  });

  it("bg-deep-black のダーク地に星雲レイヤーを重ねる", () => {
    renderConcept();
    const section = document.getElementById("concept");
    expect(section?.className).toContain("bg-deep-black");
    expect(section?.className).toContain("overflow-hidden");
    // 星雲(写真 + 縦グラデ + 青グロー)は装飾なので aria-hidden で束ねる。
    const backdrop = document.querySelector("#concept [aria-hidden='true']");
    expect(backdrop).toBeInTheDocument();
    expect(backdrop?.className).toContain("pointer-events-none");
  });
});

/**
 * この章の要:「読む順 = DOM順 = 原文順」。
 * 2カラムに割ると視線が原文と別の順番で流れるため、センター軸の一直線に組む。
 */
describe("HomeConcept の読み順", () => {
  beforeEach(() => {
    setMockReducedMotion(false);
  });

  it("原文どおり lead → 詩 → 説明 → キャッチコピー の順に並ぶ", () => {
    renderConcept();
    const text = document.getElementById("concept")?.textContent ?? "";
    const positions = [
      copy.lead,
      copy.poetry1,
      copy.poetry2,
      copy.description1,
      copy.description2,
      copy.catchcopy,
    ].map((line) => text.indexOf(line));

    expect(positions.every((index) => index >= 0)).toBe(true);
    for (let i = 1; i < positions.length; i += 1) {
      expect(positions[i]).toBeGreaterThan(positions[i - 1]);
    }
  });

  it("本文の流れをセンター軸の1カラムで組む（2カラムのグリッドを使わない）", () => {
    renderConcept();
    const lead = screen.getByText(copy.lead);
    const flow = lead.parentElement;
    expect(flow?.className).toContain("text-center");
    expect(flow?.className).toContain("mx-auto");
    expect(document.querySelector("#concept .lg\\:grid-cols-12")).toBeNull();
  });
});

/** 詩の2行は同じ級数。キャッチコピーだけわずかに大きい。 */
const POETRY_SIZE = "text-[clamp(1.4rem,2.8vw,1.85rem)]";
const CATCHCOPY_SIZE = "text-[clamp(1.5rem,3vw,2rem)]";

describe("HomeConcept の本文の組み", () => {
  beforeEach(() => {
    setMockReducedMotion(false);
  });

  it("リードは本文サイズで組み、ブロックごと中央に置く", () => {
    renderConcept();
    const lead = screen.getByText(copy.lead);
    expect(lead.className).toContain("text-[15px]");
    expect(lead.className).toContain("max-w-[36em]");
    expect(lead.className).toContain("mx-auto");
    // 読みやすさのため字面は左揃えのまま、ブロックだけ中央に置く。
    expect(lead.className).toContain("text-left");
  });

  it("詩の2行は同じ級数の明朝で組む", () => {
    renderConcept();
    const first = screen.getByText(copy.poetry1);
    const second = screen.getByText(copy.poetry2);

    for (const line of [first, second]) {
      expect(line.className).toContain("font-mincho");
      // next/font で読み込むのは 800 のみ。字面をそのウェイトに合わせる。
      expect(line.className).toContain("font-extrabold");
      // 級数の漸増で意味を持たせない。2行は対等に扱う。
      expect(line.className).toContain(POETRY_SIZE);
    }
  });

  it("説明は本文グレーで組む", () => {
    renderConcept();
    const description = screen.getByText(copy.description1);
    expect(description.className).toContain("text-[14px]");
    const block = description.parentElement;
    expect(block?.className).toContain("max-w-[33em]");
    expect(block?.className).toContain("text-text-gray");
    expect(block?.className).toContain("text-left");
  });

  it("キャッチコピーは既存の見出しと同じサンセリフで、accent の色だけで立てる", () => {
    renderConcept();
    const catchcopy = getCatchcopy();
    // 明朝は詩だけの声色にする。キャッチコピーは他セクションの見出しに揃える。
    expect(catchcopy.className).not.toContain("font-mincho");
    expect(catchcopy.className).toContain("font-sans");
    expect(catchcopy.className).toContain("font-bold");
    expect(catchcopy.className).toContain("text-accent");
    expect(catchcopy.className).toContain(CATCHCOPY_SIZE);
  });

  it("明朝を使うのは詩の2行だけに限る", () => {
    renderConcept();
    const mincho = document.querySelectorAll("#concept .font-mincho");
    const texts = new Set(
      Array.from(mincho, (element) => element.textContent?.trim())
    );
    expect(texts).toEqual(new Set([copy.poetry1, copy.poetry2]));
  });
});

/**
 * この章は特別扱いしない。装飾で語らせず、余白と文字だけで組む。
 */
describe("HomeConcept の装飾", () => {
  beforeEach(() => {
    setMockReducedMotion(false);
  });

  it("ブロック間は余白だけで区切り、光点のディバイダを置かない", () => {
    renderConcept();
    expect(document.querySelector("#concept [data-concept-spark]")).toBeNull();
  });

  it("キャッチコピーに発光(text-shadow)を持たせない", () => {
    renderConcept();
    const catchcopy = getCatchcopy();
    expect(catchcopy.getAttribute("style") ?? "").not.toContain("text-shadow");
  });

  it("キャッチコピーは読点の位置で折り返し、語の途中で割らない", () => {
    renderConcept();
    const catchcopy = getCatchcopy();
    const clauses = Array.from(catchcopy.querySelectorAll("span"));

    // 狭い幅で「大きなムーブメント」が割れないよう、節ごとに折り返し単位を作る。
    expect(clauses.map((span) => span.textContent)).toEqual([
      "小さなディンクから、",
      "大きなムーブメントへ。",
    ]);
    for (const span of clauses) {
      expect(span.className).toContain("inline-block");
    }
    // 文言そのものは分割前と同じ。messages のキーも文面も変えない。
    expect(catchcopy.textContent).toBe(copy.catchcopy);
  });

  it("prefers-reduced-motion でも詩と本文がすべて読める", () => {
    setMockReducedMotion(true);
    renderConcept();
    expect(screen.getByText(copy.poetry1)).toBeInTheDocument();
    expect(screen.getByText(copy.poetry2)).toBeInTheDocument();
    expect(screen.getByText(copy.lead)).toBeInTheDocument();
    expect(getCatchcopy()).toBeInTheDocument();
  });
});

/**
 * 320px 幅では px-6 の内側が 272px しかなく、Orbitron + tracking-[0.15em] の
 * 48px 見出しは枠を超えてページに横スクロールを出す(issue #404)。
 * sm 未満だけ下限付きの流体サイズにし、375px で 3rem(= 旧 text-5xl)へ復帰させる。
 */
const FLUID_SECTION_HEADING = "text-[clamp(2rem,22vw_-_34.5px,3rem)]";

describe("HomeConcept の見出し級数", () => {
  it("sm 未満は固定の text-5xl ではなく下限付きの流体サイズを使う", () => {
    renderConcept();
    const heading = screen.getByRole("heading", { level: 2, name: "CONCEPT" });
    const classes = heading.className.split(/\s+/);

    expect(classes).not.toContain("text-5xl");
    expect(classes).toContain(FLUID_SECTION_HEADING);
    // 旧 text-5xl の行間(1)を流体サイズでも維持する。
    expect(classes).toContain("leading-none");
    // 640px 以上の見え方は据え置き。
    expect(classes).toContain("sm:text-6xl");
    expect(classes).toContain("lg:text-7xl");
  });
});
