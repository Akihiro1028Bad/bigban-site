import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import jaMessages from "../../../messages/ja.json";
import enMessages from "../../../messages/en.json";
import HomeUsageFlow from "./HomeUsageFlow";

function renderJa() {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages}>
      <HomeUsageFlow />
    </NextIntlClientProvider>
  );
}

/** メッセージのリッチテキストタグ（nb）を除いた、描画される本文を得る。 */
function plainText(message: string): string {
  return message.replace(/<\/?nb>/g, "");
}

/** nb で分割された本文も拾えるよう、段落の textContent で照合する。 */
function findParagraphByText(container: HTMLElement, text: string) {
  return [...container.querySelectorAll("p")].find(
    (paragraph) => paragraph.textContent === text
  );
}

describe("HomeUsageFlow", () => {
  it("和文見出し「ご利用の流れ」と英字キッカーを表示する", () => {
    renderJa();
    expect(
      screen.getByRole("heading", { level: 2, name: "ご利用の流れ" })
    ).toBeInTheDocument();
    expect(screen.getByText("HOW TO USE")).toBeInTheDocument();
  });

  it('セクションID "flow" と bg-deep-black を持つ', () => {
    renderJa();
    const section = document.getElementById("flow");
    expect(section).toBeInTheDocument();
    expect(section?.className).toContain("bg-deep-black");
  });

  it("3ステップの見出しを順番に表示する", () => {
    renderJa();
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual([
      "オンラインで予約",
      "そのまま入館",
      "プレー開始",
    ]);
  });

  it("3ステップの説明文を表示する（nb タグは表示テキストを変えない）", () => {
    const { container } = renderJa();
    for (const description of [
      "予約サイトから希望の日時を選んで予約します。コートは1時間単位で借りられます。",
      "本八幡駅から徒歩1分。予約時間になったらそのまま入館できます。",
      "ノーマーキングソールのシューズをご持参ください。パドルはレンタル(1本 ¥500)もあります。",
    ]) {
      expect(findParagraphByText(container, description)).toBeInTheDocument();
    }
  });

  it("メッセージ定義と描画テキストが一致する（nb 追加で文言がずれていない）", () => {
    const { container } = renderJa();
    const { steps } = jaMessages.HomeUsageFlow;
    for (const step of [steps.reserve, steps.visit, steps.play]) {
      expect(
        findParagraphByText(container, plainText(step.description))
      ).toBeInTheDocument();
    }
  });

  it("「1時間単位で」を nowrap span で保護する（390px の語中分断対策）", () => {
    const { container } = renderJa();
    const description = findParagraphByText(
      container,
      "予約サイトから希望の日時を選んで予約します。コートは1時間単位で借りられます。"
    );
    const nowraps = [...description!.querySelectorAll("span")].filter((span) =>
      span.className.includes("whitespace-nowrap")
    );
    expect(nowraps).toHaveLength(1);
    expect(nowraps[0]).toHaveTextContent("1時間単位で");
  });

  it("「そのまま」「入館できます。」を nowrap span で保護する（320px の語中分断対策）", () => {
    const { container } = renderJa();
    const description = findParagraphByText(
      container,
      "本八幡駅から徒歩1分。予約時間になったらそのまま入館できます。"
    );
    const nowraps = [...description!.querySelectorAll("span")]
      .filter((span) => span.className.includes("whitespace-nowrap"))
      .map((span) => span.textContent);
    expect(nowraps).toEqual(["そのまま", "入館できます。"]);
  });

  it("nb タグは表示テキストを変えない（マークアップが露出しない）", () => {
    const { container } = renderJa();
    expect(container.textContent).not.toContain("<nb>");
    expect(container.textContent).not.toContain("</nb>");
  });

  it("01/02/03 の連番を表示する", () => {
    renderJa();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("レンタルシューズが無いため「手ぶら」とは案内しない", () => {
    const { container } = renderJa();
    expect(container.textContent).not.toContain("手ぶら");
  });

  it("新規CTAリンクを増やさない（直後のPRICINGに予約CTAがあるため）", () => {
    renderJa();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("英語ロケールでも3ステップを表示する", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <HomeUsageFlow />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "How to Use" })
    ).toBeInTheDocument();
    const titles = screen
      .getAllByRole("heading", { level: 3 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(["Book Online", "Walk Right In", "Start Playing"]);
  });

  it("英語は nb 無しでも t.rich で素の説明文を描画する", () => {
    const { container } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <HomeUsageFlow />
      </NextIntlClientProvider>
    );
    expect(
      screen.getByText(
        "Pick your date and time on our booking site. Courts are rented by the hour."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "One minute on foot from Motoyawata Station. Just walk in at your booked time."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Bring shoes with non-marking soles. Rental paddles are available (¥500 each)."
      )
    ).toBeInTheDocument();
    // 英語はスペースで折り返せるため nb を入れない。
    expect(container.querySelectorAll(".whitespace-nowrap")).toHaveLength(0);
  });
});
