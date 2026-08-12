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
