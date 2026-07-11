import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { QualityChecklist } from "./QualityChecklist";

import type { QualityCheck } from "./draftQuality";

const checks: QualityCheck[] = [
  { label: "AI免責文", value: "なし", level: "block", hint: "末尾に§5の免責文が必要" },
  { label: "見出し", value: "1", level: "warn", hint: "2個以上を推奨" },
  { label: "文字数", value: "2,000字", level: "ok" },
];

describe("QualityChecklist", () => {
  it("block/warn/ok の件数ピルを出す", () => {
    render(<QualityChecklist checks={checks} open={false} onToggle={vi.fn()} />);
    expect(screen.getByText(/公開不可\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/要確認\s*1/)).toBeInTheDocument();
    expect(screen.getByText(/OK\s*1/)).toBeInTheDocument();
  });

  it("トグルボタンで onToggle を呼ぶ", async () => {
    const onToggle = vi.fn();
    render(<QualityChecklist checks={checks} open={false} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("open=true で各チェックの詳細(label/hint)を展開表示する", () => {
    render(<QualityChecklist checks={checks} open onToggle={vi.fn()} />);
    expect(screen.getByText("AI免責文")).toBeInTheDocument();
    expect(screen.getByText(/末尾に§5の免責文が必要/)).toBeInTheDocument();
  });

  it("open=false では詳細行を展開しない", () => {
    render(<QualityChecklist checks={checks} open={false} onToggle={vi.fn()} />);
    expect(screen.queryByText(/末尾に§5の免責文が必要/)).not.toBeInTheDocument();
  });

  it("hint 未指定の項目は詳細テキストを描画しない", () => {
    render(<QualityChecklist checks={checks} open onToggle={vi.fn()} />);
    // 文字数(ok/hint なし)は label は出るが "—" 詳細は出ない
    expect(screen.getByText("文字数")).toBeInTheDocument();
    expect(screen.queryByText(/— 2,000字/)).not.toBeInTheDocument();
  });

  it("件数 0 のレベルはピルを描画しない", () => {
    render(
      <QualityChecklist
        checks={[{ label: "文字数", value: "x", level: "ok" }]}
        open={false}
        onToggle={vi.fn()}
      />
    );
    expect(screen.queryByText(/公開不可/)).not.toBeInTheDocument();
    expect(screen.queryByText(/要確認/)).not.toBeInTheDocument();
    expect(screen.getByText(/OK\s*1/)).toBeInTheDocument();
  });

  it("chevron が open で回転する", () => {
    const { rerender } = render(
      <QualityChecklist checks={checks} open={false} onToggle={vi.fn()} />
    );
    const label = screen.getByText("公開前チェック");
    const chevronWrap = () =>
      label.parentElement?.querySelector<HTMLElement>('[style*="transform"]');
    expect(chevronWrap()?.style.transform).toBe("none");

    rerender(<QualityChecklist checks={checks} open onToggle={vi.fn()} />);
    expect(chevronWrap()?.style.transform).toBe("rotate(180deg)");
  });
});
