// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildDigestFlex } from "./digest-flex";
import type { DigestInput } from "./digest";
import type { FlexBox, FlexButton, FlexComponent, FlexText } from "./digest-flex";

function baseInput(overrides: Partial<DigestInput> = {}): DigestInput {
  return {
    periodLabel: "2026-06-08〜06-14",
    metrics: {
      sessions: { current: 777, prior: 700, deltaPct: 11 },
      clicks: { current: 404, prior: 470, deltaPct: -14 },
      impressions: { current: 1492, prior: 1492, deltaPct: 0 },
      position: { current: 3.0, prior: 4.0, deltaPct: -25 },
    },
    topActions: ["成果を数える設定を入れる", "受け皿ページを作る"],
    pendingCount: 3,
    reportUrl: "https://xxx.notion.site/report",
    approveUrl: "https://example.com/growth/approve",
    ...overrides,
  };
}

function texts(box: FlexBox | undefined): string[] {
  if (!box) return [];
  const out: string[] = [];
  const walk = (c: FlexComponent): void => {
    if (c.type === "text") out.push(c.text);
    if (c.type === "box") c.contents.forEach(walk);
  };
  box.contents.forEach(walk);
  return out;
}

function allTextNodes(box: FlexBox | undefined): FlexText[] {
  if (!box) return [];
  const out: FlexText[] = [];
  const walk = (c: FlexComponent): void => {
    if (c.type === "text") out.push(c);
    if (c.type === "box") c.contents.forEach(walk);
  };
  box.contents.forEach(walk);
  return out;
}

describe("buildDigestFlex", () => {
  it("bubble を返し、ヘッダーに期間を載せる", () => {
    const bubble = buildDigestFlex(baseInput());
    expect(bubble.type).toBe("bubble");
    expect(texts(bubble.header).join("")).toContain("2026-06-08〜06-14");
  });

  it("body に指標・今週やること・確認待ち件数を含む", () => {
    const body = buildDigestFlex(baseInput()).body;
    const joined = texts(body).join("\n");
    expect(joined).toContain("サイト訪問");
    expect(joined).toContain("777");
    expect(joined).toContain("今週やること");
    expect(joined).toContain("成果を数える設定を入れる");
    expect(joined).toContain("確認待ち 3件");
  });

  it("増は緑・減は赤・横ばいはグレーで色分けする", () => {
    const nodes = allTextNodes(buildDigestFlex(baseInput()).body);
    const colored = nodes.filter((n) => n.color);
    const colors = colored.map((n) => n.color);
    expect(colors).toContain("#16a34a"); // sessions +11% → 緑
    expect(colors).toContain("#dc2626"); // clicks -14% → 赤
    expect(colors).toContain("#6b7280"); // impressions 0% → グレー
  });

  it("掲載順位は改善で緑になる(currentが小さいほど良い)", () => {
    const nodes = allTextNodes(buildDigestFlex(baseInput()).body);
    const positionNode = nodes.find((n) => n.text.includes("改善"));
    expect(positionNode?.color).toBe("#16a34a");
  });

  it("前週データなし(delta=null)はグレーで注記する", () => {
    const nodes = allTextNodes(
      buildDigestFlex(
        baseInput({ metrics: { sessions: { current: 10, prior: 0, deltaPct: null } } })
      ).body
    );
    const node = nodes.find((n) => n.text.includes("前週データなし"));
    expect(node?.color).toBe("#6b7280");
  });

  it("掲載順位は悪化で赤・横ばい/データなしでグレーになる", () => {
    const worse = allTextNodes(
      buildDigestFlex(
        baseInput({ metrics: { position: { current: 5.0, prior: 4.0, deltaPct: 25 } } })
      ).body
    ).find((n) => n.text.includes("悪化"));
    expect(worse?.color).toBe("#dc2626");

    const flatPhrase = allTextNodes(
      buildDigestFlex(
        baseInput({ metrics: { position: { current: 4.0, prior: 4.0, deltaPct: 0 } } })
      ).body
    ).find((n) => n.text === "前週から横ばい");
    expect(flatPhrase?.color).toBe("#6b7280");

    const noPrior = allTextNodes(
      buildDigestFlex(
        baseInput({ metrics: { position: { current: 4.0, prior: 0, deltaPct: null } } })
      ).body
    ).find((n) => n.text.includes("前週データなし"));
    expect(noPrior?.color).toBe("#6b7280");
  });

  it("警告は先頭にamberで表示する", () => {
    const body = buildDigestFlex(baseInput({ warnings: ["⚠ 失効間近"] })).body;
    const node = allTextNodes(body).find((n) => n.text.includes("失効間近"));
    expect(node?.color).toBe("#d97706");
  });

  it("承認URL/レポートURLがある週はフッターに2つのボタンを出す", () => {
    const footer = buildDigestFlex(baseInput()).footer;
    const buttons = (footer?.contents ?? []).filter(
      (c): c is FlexButton => c.type === "button"
    );
    expect(buttons).toHaveLength(2);
    const dashboard = buttons.find((b) => b.action.label.includes("ダッシュボード"));
    expect(dashboard?.action.label).toBe("ダッシュボードを開く");
    expect(dashboard?.action.uri).toBe("https://example.com/growth/approve");
    const report = buttons.find((b) => b.action.label.includes("レポート"));
    expect(report?.action.uri).toBe("https://xxx.notion.site/report");
  });

  it("承認URLが無い週は承認ボタンを出さない", () => {
    const footer = buildDigestFlex(baseInput({ approveUrl: null })).footer;
    const buttons = (footer?.contents ?? []).filter(
      (c): c is FlexButton => c.type === "button"
    );
    expect(buttons).toHaveLength(1);
    expect(buttons[0].action.label).toContain("レポート");
  });

  it("両URLとも無ければフッターを付けない", () => {
    const bubble = buildDigestFlex(baseInput({ approveUrl: null, reportUrl: null }));
    expect(bubble.footer).toBeUndefined();
  });

  it("指標・やることが無くても本文を作れる", () => {
    const body = buildDigestFlex(
      baseInput({ metrics: {}, topActions: [] })
    ).body;
    const joined = texts(body).join("\n");
    expect(joined).toContain("確認待ち 3件");
    expect(joined).not.toContain("今週やること");
  });

  it("やることは最大3件に丸める", () => {
    const body = buildDigestFlex(
      baseInput({ topActions: ["a", "b", "c", "d"] })
    ).body;
    const joined = texts(body).join("\n");
    expect(joined).toContain("3. c");
    expect(joined).not.toContain("4. d");
  });

  it("LINE要約がある場合は今週のまとめボックスを薄いグレー背景で出す", () => {
    const body = buildDigestFlex(
      baseInput({
        reportSummary: {
          lineSummary: ["検索流入は伸びたが予約導線が弱い週でした"],
          discussion: [],
          dataNotes: [],
        },
      })
    ).body;

    const summaryBox = (body?.contents ?? []).find(
      (c): c is FlexBox =>
        c.type === "box" && texts(c).some((t) => t.includes("今週のまとめ"))
    );
    expect(summaryBox?.backgroundColor).toBe("#f3f4f6");
    expect(summaryBox?.cornerRadius).toBe("md");
    expect(summaryBox?.paddingAll).toBe("md");
    expect(texts(summaryBox).join("\n")).toContain("■ 今週のまとめ");
    expect(texts(summaryBox).join("\n")).toContain("検索流入は伸びたが予約導線が弱い週でした");
  });

  it("LINE要約がある場合はフォールバックの論点・データ注意を出さない", () => {
    const joined = texts(
      buildDigestFlex(
        baseInput({
          reportSummary: {
            lineSummary: ["今週のまとめ本文"],
            discussion: ["A", "B"],
            dataNotes: ["推測を含む"],
          },
        })
      ).body
    ).join("\n");

    expect(joined).toContain("■ 今週のまとめ");
    expect(joined).not.toContain("■ 論点");
    expect(joined).not.toContain("■ データ注意");
  });

  it("LINE要約が空のときだけ論点とデータ注意をbodyにフォールバック表示する", () => {
    const body = buildDigestFlex(
      baseInput({
        reportSummary: {
          lineSummary: [],
          discussion: ["A", "B"],
          dataNotes: ["推測を含む"],
        },
      })
    ).body;
    const joined = texts(body).join("\n");

    expect(joined).not.toContain("■ 今週のまとめ");
    expect(joined).toContain("■ 論点");
    expect(joined).toContain("・A");
    expect(joined).toContain("・B");
    expect(joined).toContain("■ データ注意");
    expect(joined).toContain("・推測を含む");
  });

  it("レポート要約が未指定または空ならbodyに出さない", () => {
    const omitted = texts(buildDigestFlex(baseInput()).body).join("\n");
    expect(omitted).not.toContain("■ 今週のまとめ");
    expect(omitted).not.toContain("■ 論点");
    expect(omitted).not.toContain("■ データ注意");

    const empty = texts(
      buildDigestFlex(
        baseInput({ reportSummary: { lineSummary: [], discussion: [], dataNotes: [] } })
      ).body
    ).join("\n");
    expect(empty).not.toContain("■ 今週のまとめ");
    expect(empty).not.toContain("■ 論点");
    expect(empty).not.toContain("■ データ注意");
  });

  it("合言葉がある場合はfooter付近に太字で表示する", () => {
    const footer = buildDigestFlex(baseInput({ passphrase: " ピックルバン " })).footer;
    const nodes = allTextNodes(footer);
    const passphrase = nodes.find((node) => node.text === "🔑 合言葉: ピックルバン");

    expect(passphrase?.weight).toBe("bold");
  });

  it("合言葉が未指定・空ならfooterに出さない", () => {
    const omitted = texts(buildDigestFlex(baseInput()).footer).join("\n");
    expect(omitted).not.toContain("🔑 合言葉:");

    const empty = texts(buildDigestFlex(baseInput({ passphrase: "  " })).footer).join("\n");
    expect(empty).not.toContain("🔑 合言葉:");
  });
});
