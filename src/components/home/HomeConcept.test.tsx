import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import HomeConcept from "./HomeConcept";

describe("HomeConcept", () => {
  it('セクションID "concept" を持つ', () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("concept");
    expect(section).toBeInTheDocument();
  });

  it("章の縦リズム py-16 lg:py-24 を持つ（主要セクション共通）", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("concept");
    expect(section?.className).toContain("py-16");
    expect(section?.className).toContain("lg:py-24");
  });

  it("CONCEPTタイトルを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("CONCEPT")).toBeInTheDocument();
  });

  it("日本語サブタイトル「コンセプト」を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("コンセプト")).toBeInTheDocument();
  });

  it("リードコピーを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(/ビッグバンによって誕生したように/)).toBeInTheDocument();
  });

  it("詩的な行を英数字の1で表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("1つの小さなプレー。")).toBeInTheDocument();
    expect(screen.getByText("1つの小さなディンク。")).toBeInTheDocument();
  });

  it("説明テキストを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    expect(screen.getByText(/やがて大きなエネルギーとなり/)).toBeInTheDocument();
  });

  it("キャッチコピーを表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    expect(screen.getByText("小さなディンクから、大きなムーブメントへ。")).toBeInTheDocument();
  });

  it("ビッグバン画像を表示する", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    const img = screen.getByAltText("ビッグバン — 宇宙の誕生");
    expect(img).toBeInTheDocument();
  });

  it("bg-off-white 背景クラスを持つ", () => {
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
    const section = document.getElementById("concept");
    expect(section?.className).toContain("bg-off-white");
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
    render(
      <NextIntlClientProvider locale="ja" messages={jaMessages}>
        <HomeConcept />
      </NextIntlClientProvider>
    );
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
