import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import PlayerCard, { type Player } from "./PlayerCard";

const activePlayer: Player = {
  name: "山田 太郎",
  ig: "@taro_yamada_pb",
  bio: "元テニスプレーヤー。2024年よりピックルボールに転向。",
};

const comingSoonPlayer: Player = {
  name: "Coming Soon",
  ig: "",
  bio: "",
};

function renderCard(player: Player) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      <PlayerCard player={player} />
    </NextIntlClientProvider>
  );
}

describe("PlayerCard", () => {
  it("選手名を表示する", () => {
    renderCard(activePlayer);
    expect(screen.getByText(activePlayer.name)).toBeInTheDocument();
  });

  it("IGハンドルを表示する", () => {
    renderCard(activePlayer);
    expect(screen.getByText(activePlayer.ig)).toBeInTheDocument();
  });

  it("IGハンドルがInstagramプロフィールへの外部リンクになっている", () => {
    renderCard(activePlayer);
    const link = screen.getByText(activePlayer.ig).closest("a");
    expect(link).toHaveAttribute(
      "href",
      "https://www.instagram.com/taro_yamada_pb/"
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("IGリンク内にInstagramアイコンを表示する", () => {
    renderCard(activePlayer);
    const link = screen.getByText(activePlayer.ig).closest("a");
    const svg = link?.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("bioを表示する", () => {
    renderCard(activePlayer);
    expect(screen.getByText(activePlayer.bio)).toBeInTheDocument();
  });

  it("Photoプレースホルダを表示する", () => {
    renderCard(activePlayer);
    expect(
      screen.getByText(jaMessages.About.photoPlaceholder)
    ).toBeInTheDocument();
  });

  it("ig / bio が空文字のときは IG と bio を描画しない", () => {
    renderCard(comingSoonPlayer);
    expect(screen.getByText(comingSoonPlayer.name)).toBeInTheDocument();
    expect(screen.queryByText(activePlayer.ig)).not.toBeInTheDocument();
    expect(screen.queryByText(activePlayer.bio)).not.toBeInTheDocument();
  });

  it("aspect-[4/5] の Photo 領域を持つ", () => {
    const { container } = renderCard(activePlayer);
    const photoArea = container.querySelector('.aspect-\\[4\\/5\\]');
    expect(photoArea).toBeInTheDocument();
  });

  it("image 指定時は object-contain の主画像とブラー背景の2枚を描画する", () => {
    const { container } = renderCard({
      ...activePlayer,
      image: "/images/yuta-yoshida.jpg",
      imageAlt: "吉田 祐太",
    });
    const containImg = container.querySelector("img.object-contain");
    const blurImg = container.querySelector("img.blur-2xl");
    expect(containImg).toBeInTheDocument();
    expect(blurImg).toBeInTheDocument();
    expect(blurImg?.getAttribute("aria-hidden")).toBe("true");
  });

  it("image プロパティが指定されているときは画像を表示しプレースホルダは表示しない", () => {
    renderCard({
      ...activePlayer,
      image: "/images/yuta-yoshida.jpg",
      imageAlt: "吉田 祐太",
    });
    const img = screen.getByAltText("吉田 祐太");
    expect(img).toBeInTheDocument();
    expect(
      screen.queryByText(jaMessages.About.photoPlaceholder)
    ).not.toBeInTheDocument();
  });

  it("imageAlt 未指定時は player.name をaltにフォールバックする", () => {
    renderCard({
      ...activePlayer,
      image: "/images/yuta-yoshida.jpg",
    });
    const img = screen.getByAltText(activePlayer.name);
    expect(img).toBeInTheDocument();
  });

  it("カード外枠に h-full を持ち高さ揃えに対応する", () => {
    const { container } = renderCard(activePlayer);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("h-full");
  });

  it("bio要素に whitespace-pre-line が適用されている", () => {
    const { container } = renderCard(activePlayer);
    const bio = container.querySelector("p.whitespace-pre-line");
    expect(bio).toBeInTheDocument();
    expect(bio?.textContent).toBe(activePlayer.bio);
  });

  it("コンテンツラッパーに text-center がない (左揃え)", () => {
    const { container } = renderCard(activePlayer);
    const wrapper = container.querySelector(".p-6");
    expect(wrapper?.className).not.toContain("text-center");
  });
});
