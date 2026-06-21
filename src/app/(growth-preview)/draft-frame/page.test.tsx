import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DraftFramePage from "./page";

describe("DraftFramePage", () => {
  it("DraftFrameClient(初期=空)を描画する", () => {
    render(<DraftFramePage />);
    expect(screen.getByText("本文がありません。")).toBeInTheDocument();
  });
});
