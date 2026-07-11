/**
 * 承認画面(/growth/approve)の a11y 自動監査(#P6 Task 6・axe 初導入)。
 *
 * 主要 6 状態を render し axe-core にかけて重大な a11y 違反(role/name/構造)を検出する。
 * ①ログイン画面 ②盤＋詳細パネル(記事選択・下書き ready) ③施策 view ④成績 view
 * ⑤公開キュー ⑥プロンプト view。
 *
 * ⚠️ jsdom 制約: 本テストは jsdom 上で走るため、色コントラスト(color-contrast)や
 * 実レンダリングに依存するチェックは axe-core が実行できない/信頼できない
 * (getComputedStyle が実ブラウザと一致しないため)。したがって本文コントラスト
 * (var(--p-text-*))の AA 判定は本テストの対象外。実測を伴う color-contrast 監査は
 * Playwright + @axe-core/playwright による E2E で担う(将来項目・本リポジトリ未導入)。
 * ここでは jsdom で確実に評価できる構造系ルール(role/aria/name/landmark/list 等)に絞る。
 *
 * 監査対象は実コンポーネント: ⑥プロンプト view は PromptsView 実体を描画して axe にかける
 * (fetchPrompts を PromptsView.test.tsx と同じ idiom で MSW 代わりに mock する)。
 * 下書きリッチエディタ(DraftEditor/TipTap)は編集オーバーレイ専用で本 6 状態のどれにも
 * 描画されないため、本テストの監査対象ではない(モックは念のための保険で、実際には未使用)。
 *
 * セットアップ idiom は ApproveClient.test.tsx を流用(featureFlags のモック・
 * mockFetchSequence・login・selectView)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";

import { renderWithClient } from "@/test/renderWithClient";
import * as axeMatchers from "vitest-axe/matchers";
import type { AxeMatchers } from "vitest-axe/matchers";
import { axe } from "vitest-axe";

expect.extend(axeMatchers);

// vitest-axe@0.1.0 の extend-expect は旧 `Vi` 名前空間を拡張するが、vitest@4 の
// アサーション型は `vitest` モジュールの Assertion/AsymmetricMatchers を見るため、
// v4 向けにローカルで型拡張する(toHaveNoViolations を expect に認識させる)。
declare module "vitest" {
  // 空 interface だが module augmentation 用途(AxeMatchers を Assertion に合成する)なので許容。
  /* eslint-disable @typescript-eslint/no-empty-object-type */
  interface Assertion extends AxeMatchers {}
  interface AsymmetricMatchersContaining extends AxeMatchers {}
  /* eslint-enable @typescript-eslint/no-empty-object-type */
}

// jsdom では色コントラストや一部の視覚依存ルールが信頼できないため、構造系のみに絞る。
// color-contrast は jsdom の getComputedStyle 制約で正しく評価できない(誤検知/未評価)。
// iframes:false は jsdom 誤検知回避: 下書きプレビュー(iframe)へ axe が postMessage で
// 潜ろうとして "Respondable target must be a frame" で落ちるため、フレーム越境検査を無効化する
// (iframe 内の本番テーマ描画は本テストのスコープ外)。
const AXE_OPTIONS = {
  iframes: false,
  rules: {
    "color-contrast": { enabled: false },
  },
} as const;

function render(ui: ReactElement): ReturnType<typeof renderWithClient> {
  return renderWithClient(ui);
}

const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
  isCmsNewsEnabled: () => false,
}));

// TipTap 本体はカバレッジ除外・jsdom で重いため textarea スタブに差し替える(保険)。
// ただし DraftEditor は編集オーバーレイ専用で、本テストの 6 状態のどれにも描画されない
// (=このスタブは実際には未使用。監査しているのは実コンポーネント側)。
vi.mock("./DraftEditor", () => ({
  DraftEditor: ({
    initialHtml,
    onChange,
  }: {
    initialHtml: string;
    onChange: (html: string) => void;
  }) => (
    <textarea
      aria-label="本文エディタ"
      defaultValue={initialHtml}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// ⑥ プロンプト view は PromptsView 実体を axe にかける(偽緑を避ける)。データ取得の
// fetchPrompts のみ mock し、PromptsView.test.tsx と同じ idiom でサンプルを返す。
import { fetchPrompts, type PromptsData } from "./api";
vi.mock("./api", async () => {
  const actual = await vi.importActual<typeof import("./api")>("./api");
  return { ...actual, fetchPrompts: vi.fn() };
});

const PROMPTS_SAMPLE: PromptsData = {
  facilityContext: '{"open":false}',
  warnings: [],
  groups: [
    {
      group: "実行プロンプト",
      phases: [
        {
          path: "scripts/growth/prompts/weekly.md",
          filename: "weekly.md",
          label: "週次分析",
          group: "実行プロンプト",
          order: 1,
          purpose: "週次分析の実行テンプレート",
          stage: "週次分析",
          whenItRuns: "週次の分析をするとき",
          sourceKind: "prompt",
          content: "週次の指示本文",
        },
      ],
    },
  ],
};

import { ApproveClient } from "./ApproveClient";
import type { GrowthOpsView } from "@/lib/growth/workerLog";

const EMPTY_OPS: GrowthOpsView = {
  setupMissing: true,
  worker: {
    status: "unknown",
    workerId: null,
    lastHeartbeatAt: null,
    currentJob: null,
  },
  currentTargets: [],
  recentRuns: [],
  recentFailures: [],
  reconcileFindings: [],
};

function mockFetchSequence(
  ...responses: Array<
    { ok?: boolean; status?: number; json?: unknown; text?: string } | Error | string
  >
) {
  const fn = vi.fn();
  const queue = [...responses];
  fn.mockImplementation((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/api/growth/ops")) {
      fn.mock.calls.pop();
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ success: true, ops: EMPTY_OPS }),
        text: async () => JSON.stringify({ success: true, ops: EMPTY_OPS }),
      });
    }
    const r = queue.shift();
    if (!r) return Promise.reject(new Error(`unexpected fetch: ${url}`));
    if (r instanceof Error || typeof r === "string") {
      return Promise.reject(r);
    }
    const body = r.text ?? JSON.stringify(r.json);
    return Promise.resolve({
      ok: r.ok ?? true,
      status: r.status ?? 200,
      json: async () => r.json,
      text: async () => body,
    });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const PASS = "ビックマン";

beforeEach(() => {
  flags.authEnabled = true;
  vi.mocked(fetchPrompts).mockReset();
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function login(pass: string = PASS): Promise<void> {
  await userEvent.type(screen.getByLabelText("合言葉"), pass);
  await userEvent.click(screen.getByRole("button", { name: "確認する" }));
}

async function selectView(name: RegExp): Promise<void> {
  const nav = await screen.findByRole("navigation", { name: "情報源" });
  await userEvent.click(within(nav).getByRole("button", { name }));
}

function ideaItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "i1",
    kind: "idea",
    title: "猛暑記事",
    subtitle: "夏の集客",
    details: [{ label: "優先度", value: "中" }],
    stage: "proposed",
    ...over,
  };
}

function proposalItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "p1",
    kind: "proposal",
    title: "市川ページ",
    subtitle: "サイト表示内容",
    details: [{ label: "優先度", value: "高" }],
    score: 8,
    stage: "untouched",
    ...over,
  };
}

const draftReady = (bodyHtml: string) => ({
  json: {
    success: true,
    exists: true,
    draft: { title: "T", displayMode: "html", bodyHtml, body: "" },
  },
});

describe("承認画面 a11y 監査(axe・jsdom 構造系のみ)", () => {
  it("①ログイン画面に重大な a11y 違反がない", async () => {
    mockFetchSequence();
    const { container } = render(<ApproveClient />);
    await screen.findByLabelText("合言葉");
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("②盤＋詳細パネル(記事選択・下書き ready)に重大な a11y 違反がない", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      draftReady("<p>下書き本文です</p>")
    );
    const { container } = render(<ApproveClient />);
    await login();
    await selectView(/記事/);
    await screen.findByText("猛暑記事");
    // #213: 一覧行に「詳細」ボタンは無い。タイトル(開く起点)をクリックして詳細を開く。
    await userEvent.click(screen.getByRole("button", { name: "猛暑記事" }));
    const dialog = await screen.findByRole("region", { name: "詳細: 猛暑記事" });
    await within(dialog).findByTitle("公開後プレビュー");
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("③施策 view に重大な a11y 違反がない", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    const { container } = render(<ApproveClient />);
    await login();
    await selectView(/施策/);
    await screen.findByRole("region", { name: "施策レーン" });
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("④成績 view に重大な a11y 違反がない", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ id: "i1", title: "公開済み記事", stage: "queued" })] },
    });
    const { container } = render(<ApproveClient />);
    await login();
    await selectView(/成績/);
    expect(screen.getByRole("main")).toHaveAttribute("aria-label", "成績");
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("⑤公開キュー view に重大な a11y 違反がない", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [ideaItem({ id: "i1", title: "承認済み記事", stage: "queued", isDraftReady: true })],
      },
    });
    const { container } = render(<ApproveClient />);
    await login();
    await selectView(/^公開$/);
    expect(screen.getByRole("main")).toHaveAttribute("aria-label", "公開");
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });

  it("⑥プロンプト view(PromptsView 実体)に重大な a11y 違反がない", async () => {
    vi.mocked(fetchPrompts).mockResolvedValue(PROMPTS_SAMPLE);
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    const { container } = render(<ApproveClient />);
    await login();
    await selectView(/AI設定/);
    await userEvent.click(screen.getByRole("tab", { name: "プロンプト" }));
    // PromptsView 実体が描画されたことを確認してから監査する(スタブではない)。
    await screen.findByRole("navigation", { name: "プロンプト一覧" });
    expect(await axe(container, AXE_OPTIONS)).toHaveNoViolations();
  });
});
