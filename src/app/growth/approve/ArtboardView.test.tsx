import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ArtboardView } from "./ArtboardView";
import type { OutlineSection } from "./outline";
import type { ComponentProps } from "react";

const BASE_SECTIONS: OutlineSection[] = [
  {
    heading: "初心者が最初に覚えるルール",
    description: "サーブ、キッチン、得点の流れを短く整理する。",
    images: [],
  },
  {
    heading: "予約から体験までの流れ",
    description: "申し込みから当日受付までを説明する。",
    images: [],
  },
];

function renderArtboard(
  props: Partial<ComponentProps<typeof ArtboardView>> = {},
) {
  return render(
    <ArtboardView
      sections={BASE_SECTIONS}
      onSave={vi.fn(async () => true)}
      onOpenEyecatch={vi.fn()}
      isSaving={false}
      {...props}
    />,
  );
}

function firstEditor(heading: string): HTMLElement {
  return screen.getAllByRole("region", { name: `画像スロット編集: ${heading}` })[0];
}

describe("ArtboardView", () => {
  it("empty スロットを編集して保存すると画像指示を追加した sections を onSave に渡す", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    renderArtboard({ onSave });

    await user.click(screen.getByRole("button", { name: "画像を置く: 初心者が最初に覚えるルール" }));
    const editor = firstEditor("初心者が最初に覚えるルール");
    const description = within(editor).getByLabelText("画像の説明");
    expect(description).toHaveValue("初心者が最初に覚えるルールに合う図を提案する");

    await user.click(within(editor).getByRole("radio", { name: "コート図" }));
    expect(within(editor).getByLabelText("図に入れる文字・数値")).toBeInTheDocument();
    await user.clear(description);
    await user.type(description, "キッチンとサーブ位置を俯瞰で示す");
    await user.type(within(editor).getByLabelText("図に入れる文字・数値"), "キッチン\nサーブ位置");
    await user.click(within(editor).getByRole("button", { name: "画像指示を保存" }));

    expect(onSave).toHaveBeenCalledWith([
      {
        ...BASE_SECTIONS[0],
        images: [
          {
            style: "court",
            description: "キッチンとサーブ位置を俯瞰で示す",
            textSpec: "キッチン サーブ位置",
          },
        ],
        suppressImage: undefined,
      },
      BASE_SECTIONS[1],
    ]);
  });

  it("court では textSpec 欄を出し、mascot では隠す", async () => {
    const user = userEvent.setup();
    renderArtboard();

    await user.click(screen.getByRole("button", { name: "画像を置く: 初心者が最初に覚えるルール" }));
    const editor = firstEditor("初心者が最初に覚えるルール");
    await user.click(within(editor).getByRole("radio", { name: "コート図" }));
    expect(within(editor).getByLabelText("図に入れる文字・数値")).toBeInTheDocument();

    await user.click(within(editor).getByRole("radio", { name: "宇宙人マスコット" }));
    expect(within(editor).queryByLabelText("図に入れる文字・数値")).not.toBeInTheDocument();
  });

  it("画像なしを選んで保存すると suppressImage=true かつ images=[] を渡す", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    renderArtboard({ onSave });

    await user.click(screen.getByRole("button", { name: "画像を置く: 予約から体験までの流れ" }));
    const editor = firstEditor("予約から体験までの流れ");
    await user.click(within(editor).getByRole("checkbox", { name: "画像なし" }));
    await user.click(within(editor).getByRole("button", { name: "画像指示を保存" }));

    expect(onSave).toHaveBeenCalledWith([
      BASE_SECTIONS[0],
      { ...BASE_SECTIONS[1], images: [], suppressImage: true },
    ]);
  });

  it("複数画像を持つセクションでは画像ごとのスロットを描画し、1枚目の編集で2枚目を保持する", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    const sections: OutlineSection[] = [
      {
        heading: "複数画像セクション",
        description: "説明",
        images: [
          { style: "court", description: "既存のコート図", textSpec: "キッチン" },
          { style: "flow", description: "既存の導線図", textSpec: "受付 > 体験" },
        ],
      },
    ];
    renderArtboard({ sections, onSave });

    expect(screen.getByRole("button", { name: "画像を編集: 複数画像セクション 1枚目" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "画像を編集: 複数画像セクション 2枚目" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "画像を編集: 複数画像セクション 1枚目" }));
    const editor = firstEditor("複数画像セクション");
    await user.clear(within(editor).getByLabelText("画像の説明"));
    await user.type(within(editor).getByLabelText("画像の説明"), "更新したコート図");
    await user.click(within(editor).getByRole("button", { name: "画像指示を保存" }));

    expect(onSave).toHaveBeenCalledWith([
      {
        ...sections[0],
        images: [
          { style: "court", description: "更新したコート図", textSpec: "キッチン" },
          { style: "flow", description: "既存の導線図", textSpec: "受付 > 体験" },
        ],
        suppressImage: undefined,
      },
    ]);
  });

  it("複数画像を持つセクションの画像を個別に削除できる", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    const sections: OutlineSection[] = [
      {
        heading: "複数画像セクション",
        description: "説明",
        images: [
          { style: "court", description: "既存のコート図", textSpec: "キッチン" },
          { style: "flow", description: "既存の導線図", textSpec: "受付 > 体験" },
        ],
      },
    ];
    renderArtboard({ sections, onSave });

    await user.click(screen.getByRole("button", { name: "画像を編集: 複数画像セクション 2枚目" }));
    const editor = firstEditor("複数画像セクション");
    await user.click(within(editor).getByRole("button", { name: "この画像を削除" }));

    expect(onSave).toHaveBeenCalledWith([
      {
        ...sections[0],
        images: [{ style: "court", description: "既存のコート図", textSpec: "キッチン" }],
        suppressImage: undefined,
      },
    ]);
  });

  it("画像があるセクションにも上限未満なら追加スロットを描画し、保存時は末尾に追加する", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => true);
    const sections: OutlineSection[] = [
      {
        heading: "追加できるセクション",
        description: "説明",
        images: [{ style: "court", description: "既存のコート図", textSpec: "キッチン" }],
      },
    ];
    renderArtboard({ sections, onSave });

    await user.click(screen.getByRole("button", { name: "画像を置く: 追加できるセクション" }));
    const editor = firstEditor("追加できるセクション");
    await user.click(within(editor).getByRole("radio", { name: "フロー図" }));
    await user.clear(within(editor).getByLabelText("画像の説明"));
    await user.type(within(editor).getByLabelText("画像の説明"), "受付から体験までの流れ");
    await user.type(within(editor).getByLabelText("図に入れる文字・数値"), "受付\n着替え\n体験");
    await user.click(within(editor).getByRole("button", { name: "画像指示を保存" }));

    expect(onSave).toHaveBeenCalledWith([
      {
        ...sections[0],
        images: [
          { style: "court", description: "既存のコート図", textSpec: "キッチン" },
          { style: "flow", description: "受付から体験までの流れ", textSpec: "受付 着替え 体験" },
        ],
        suppressImage: undefined,
      },
    ]);
  });

  it("ユーザーが書いた説明はスタイル切替で上書きしない", async () => {
    const user = userEvent.setup();
    renderArtboard();

    await user.click(screen.getByRole("button", { name: "画像を置く: 初心者が最初に覚えるルール" }));
    const editor = firstEditor("初心者が最初に覚えるルール");
    const description = within(editor).getByLabelText("画像の説明");
    await user.clear(description);
    await user.type(description, "ユーザーが書いた説明");
    await user.click(within(editor).getByRole("radio", { name: "コート図" }));

    expect(description).toHaveValue("ユーザーが書いた説明");
  });

  it("3枚 specified 済みなら空スロットの追加ボタンを無効化して上限文言を出す", () => {
    const sections: OutlineSection[] = [
      {
        heading: "A",
        description: "a",
        images: [{ style: "auto", description: "a" }],
      },
      {
        heading: "B",
        description: "b",
        images: [{ style: "mascot", description: "b" }],
      },
      {
        heading: "C",
        description: "c",
        images: [{ style: "flow", description: "c" }],
      },
      {
        heading: "D",
        description: "d",
        images: [],
      },
    ];
    renderArtboard({ sections });

    const blocked = screen.getByRole("button", { name: "画像上限のため追加できません: D" });
    expect(blocked).toBeDisabled();
    expect(screen.getByText("上限 3 枚(他のセクションの画像を減らすと追加できます)")).toBeInTheDocument();
  });

  it("アイキャッチ枠はプレースホルダ/実画像を出し、クリックで onOpenEyecatch を呼ぶ", async () => {
    const user = userEvent.setup();
    const onOpenEyecatch = vi.fn();
    const { rerender } = render(
      <ArtboardView
        sections={BASE_SECTIONS}
        onSave={vi.fn(async () => true)}
        onOpenEyecatch={onOpenEyecatch}
        isSaving={false}
      />,
    );

    expect(screen.getByText("下書き生成時に自動生成されます")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "アイキャッチを開く" }));
    expect(onOpenEyecatch).toHaveBeenCalledTimes(1);

    rerender(
      <ArtboardView
        sections={BASE_SECTIONS}
        eyecatchUrl="https://images.microcms-assets.io/assets/site/eye.png"
        onSave={vi.fn(async () => true)}
        onOpenEyecatch={onOpenEyecatch}
        isSaving={false}
      />,
    );
    expect(screen.getByRole("img", { name: "アイキャッチ" })).toHaveAttribute(
      "src",
      expect.stringContaining("eye.png"),
    );
  });

  it("isSaving 中は保存ボタンを disabled にし、saveError を表示する", async () => {
    const user = userEvent.setup();
    renderArtboard({ isSaving: true, saveError: "保存に失敗しました" });

    await user.click(screen.getByRole("button", { name: "画像を置く: 初心者が最初に覚えるルール" }));
    const editor = firstEditor("初心者が最初に覚えるルール");
    expect(within(editor).getByRole("button", { name: "画像指示を保存" })).toBeDisabled();
    expect(within(editor).getByText("保存に失敗しました")).toBeInTheDocument();
  });
});
