import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithIntl } from "@/test-utils/intl-wrapper";
import HyroxCoach from "./HyroxCoach";

describe("HyroxCoach", () => {
  it("セクションタイトル CREW を表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(screen.getByRole("heading", { name: "CREW" })).toBeInTheDocument();
  });

  it("コーチ名と肩書きを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(
      screen.getByRole("heading", { name: "関吉大亮" })
    ).toBeInTheDocument();
    expect(screen.getByText("HYROX担当コーチ")).toBeInTheDocument();
  });

  it("称号と数値スタッツを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(screen.getByText("HYROX Japan アンバサダー")).toBeInTheDocument();
    expect(screen.getByText("1:01:45")).toBeInTheDocument();
    expect(screen.getByText("WALL BALLS")).toBeInTheDocument();
  });

  it("Instagram への外部リンクを表示する", () => {
    renderWithIntl(<HyroxCoach />);
    const link = screen.getByRole("link", { name: /Instagram/ });
    expect(link).toHaveAttribute(
      "href",
      "https://www.instagram.com/syugyou_sou/"
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("ポートレート画像に alt を設定する", () => {
    renderWithIntl(<HyroxCoach />);
    expect(
      screen.getByAltText("HYROX担当コーチ 関吉大亮")
    ).toBeInTheDocument();
  });
});
