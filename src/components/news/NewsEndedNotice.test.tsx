import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { NewsEndedNotice } from "./NewsEndedNotice";

describe("NewsEndedNotice", () => {
  it("日本語: 終了の告知とニュース一覧・予約ページへのリンク", () => {
    render(<NewsEndedNotice locale="ja" />);
    expect(screen.getByRole("note")).toHaveTextContent(
      "このイベントは終了しました。",
    );
    expect(screen.getByRole("link", { name: "ニュース一覧" })).toHaveAttribute(
      "href",
      "/news",
    );
    expect(screen.getByRole("link", { name: "予約ページ" })).toHaveAttribute(
      "href",
      "/reserve",
    );
  });

  it("英語: ロケール接頭辞つきのリンク", () => {
    render(<NewsEndedNotice locale="en" />);
    expect(screen.getByRole("note")).toHaveTextContent("This event has ended.");
    expect(screen.getByRole("link", { name: "News" })).toHaveAttribute(
      "href",
      "/en/news",
    );
    expect(screen.getByRole("link", { name: "Reserve" })).toHaveAttribute(
      "href",
      "/en/reserve",
    );
  });
});
