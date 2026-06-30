import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactElement } from "react";
import userEvent from "@testing-library/user-event";

import { renderWithClient } from "@/test/renderWithClient";

// #H7: ApproveClient は React Query を使うため、全 render を QueryClientProvider 配下に置く。
// 盤フェッチは boardSeeded ゲートで命令的 fetchPending(=mockFetchSequence)が seed するため、
// 既存の fetch スタブ方式はそのまま使える(query はマウント時に fetch しない)。
function render(ui: ReactElement): ReturnType<typeof renderWithClient> {
  return renderWithClient(ui);
}

// 合言葉認証フラグはテストごとに切り替える。既定の各テストは「有効(=現行のゲート)」で検証し、
// 無効(一時措置)の挙動は専用 describe で flags.authEnabled=false にして検証する。
const { flags } = vi.hoisted(() => ({ flags: { authEnabled: true } }));
vi.mock("@/config/featureFlags", () => ({
  get APPROVE_AUTH_ENABLED() {
    return flags.authEnabled;
  },
  isCmsNewsEnabled: () => false,
}));

// TipTap 本体(DraftEditor)はカバレッジ除外・jsdom で重いため、テストでは
// initialHtml/onChange だけ持つ textarea スタブに差し替える(#77 の結線ロジックを検証)。
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

// プロンプト確認タブは自前で fetch するため、ApproveClient の結線検証では軽量スタブに差し替える
// (中身は PromptsView.test.tsx で個別に検証済み)。
vi.mock("./PromptsView", () => ({
  PromptsView: ({ token }: { token: string }) => <div>プロンプト確認スタブ:{token}</div>,
}));

import { ApproveClient } from "./ApproveClient";
import { STUCK_THRESHOLD_MS } from "./generating";

function mockFetchSequence(
  ...responses: Array<
    { ok?: boolean; status?: number; json?: unknown; text?: string } | Error | string
  >
) {
  const fn = vi.fn();
  responses.forEach((r) => {
    if (r instanceof Error || typeof r === "string") {
      fn.mockRejectedValueOnce(r);
    } else {
      // 本番は readJsonObject 経由で res.text() を読むため text を必ず供給する。
      // text 明示時はそれを優先(空ボディ/非 JSON のケース表現用)。
      const body = r.text ?? JSON.stringify(r.json);
      fn.mockResolvedValueOnce({
        ok: r.ok ?? true,
        status: r.status ?? 200,
        json: async () => r.json,
        text: async () => body,
      });
    }
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

// 遅延制御(release)用の手組みモックで使う、json/text 両対応の擬似 Response。
function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const PASS = "ビックマン";
const TOKEN_URL = "/api/growth/approve";

beforeEach(() => {
  flags.authEnabled = true;
  // #119: ?view はタブ切替で URL に書かれる。テスト間で漏れないよう毎回リセットする。
  window.history.replaceState(null, "", "/");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function login(pass: string = PASS): Promise<void> {
  await userEvent.type(screen.getByLabelText("合言葉"), pass);
  await userEvent.click(screen.getByRole("button", { name: "確認する" }));
}

// #107: 盤では決定済みカードも各列に残り続けるため「未処理のみ」トグルは廃止。
// 旧テストの呼び出し互換のため no-op として残す(決定済みは常に列に表示される)。
async function showAll(): Promise<void> {
  // 盤レイアウトでは決定済みカードが常時表示されるため何もしない。
}

// #119: 施策/記事はタブで分離。指定タブをクリックして切り替える。
async function selectTab(name: RegExp): Promise<void> {
  await userEvent.click(screen.getByRole("tab", { name }));
}

// 差分B: 詳細パネルの「AIに相談」起点ボタンから相談ドロワーを開き、ドロワー要素を返す。
// AI修正(構成案/タイトル)・アドバイス・文章相談はドロワー内に集約されたため、
// それらの検証は詳細ダイアログではなくドロワー内で行う。
async function openConsultDrawer(detailDialog: HTMLElement): Promise<HTMLElement> {
  await userEvent.click(within(detailDialog).getByRole("button", { name: "AIに相談" }));
  return screen.findByRole("dialog", { name: "AIに相談" });
}

// ドロワーのタブ(全体を見てもらう/構成案を直す/この文を直す)を切り替える。
async function selectConsultTab(drawer: HTMLElement, name: string): Promise<void> {
  await userEvent.click(within(drawer).getByRole("tab", { name }));
}

function proposalItem(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "p1",
    kind: "proposal",
    title: "市川ページ",
    subtitle: "サイト表示内容",
    details: [
      { label: "優先度スコア", value: "8.5" },
      { label: "確度", value: "高" },
    ],
    stage: "untouched",
    ...over,
  };
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

describe("ApproveClient 合言葉画面", () => {
  it("入力意図の説明文を表示する(#229)", () => {
    mockFetchSequence();
    render(<ApproveClient />);
    expect(
      screen.getByText("LINE で届いた合言葉を入力してください。")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "確認する" })).toBeInTheDocument();
  });

  it("合言葉入力欄は初期状態でtext型(日本語IMEが効く)", () => {
    mockFetchSequence();
    render(<ApproveClient />);
    expect(screen.getByLabelText("合言葉")).toHaveAttribute("type", "text");
  });

  it("表示/非表示トグルで合言葉の表示を切り替えられる", async () => {
    mockFetchSequence();
    render(<ApproveClient />);
    const input = screen.getByLabelText("合言葉");
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "合言葉を隠す" }));
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "合言葉を表示" }));
    expect(input).toHaveAttribute("type", "text");
  });

  it("合言葉未入力なら促してfetchしない", async () => {
    const fn = mockFetchSequence();
    render(<ApproveClient />);
    await userEvent.click(screen.getByRole("button", { name: "確認する" }));
    expect(screen.getByRole("alert")).toHaveTextContent("合言葉を入力してください。");
    expect(fn).not.toHaveBeenCalled();
  });

  it("正しい合言葉で承認待ちを一覧表示し、合言葉をtokenとして送る", async () => {
    const fn = mockFetchSequence({
      json: { success: true, items: [proposalItem(), ideaItem()] },
    });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText("市川ページ")).toBeInTheDocument();
    // #90: 既定は施策タブ。記事は記事タブへ切り替えると見える。
    await selectTab(/記事/);
    expect(screen.getByText("猛暑記事")).toBeInTheDocument();
    expect(fn.mock.calls[0][0]).toBe(TOKEN_URL);
  });

  it("プロンプトタブに切り替えると確認ビューを表示する(#プロンプト透明化)", async () => {
    mockFetchSequence({
      json: { success: true, items: [proposalItem(), ideaItem()] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await selectTab(/プロンプト/);
    expect(screen.getByText(/プロンプト確認スタブ/)).toBeInTheDocument();
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-label", "プロンプト");
  });

  it("種別バッジを一覧に表示し、判断根拠(details)は詳細パネルで見る(#226/#227)", async () => {
    mockFetchSequence({
      json: { success: true, items: [proposalItem(), ideaItem()] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    // バッジは一覧の各行に出る(#90: タブごとに該当カテゴリの行のみ表示)
    expect(screen.getByText("📋 施策")).toBeInTheDocument();
    await selectTab(/記事/);
    expect(screen.getByText("📝 記事")).toBeInTheDocument();
    await selectTab(/施策/);
    // 数値根拠は一覧には出さず、詳細パネルに入れる(#275 高密度化)
    expect(screen.queryByText("優先度スコア")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("優先度スコア")).toBeInTheDocument();
    expect(within(dialog).getByText("8.5")).toBeInTheDocument();
    expect(within(dialog).getByText("確度")).toBeInTheDocument();
  });

  it("details も subtitle も無い項目でも壊れない", async () => {
    mockFetchSequence({
      json: { success: true, items: [{ id: "p1", kind: "proposal", title: "A", subtitle: "" }] },
    });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText("A")).toBeInTheDocument();
    expect(screen.getByText("📋 施策")).toBeInTheDocument();
  });

  it("合言葉が違うと401で導線付きメッセージを出す(#229)", async () => {
    mockFetchSequence({ ok: false, status: 401, json: { success: false, error: "認証に失敗しました" } });
    render(<ApproveClient />);
    await login("ちがう");
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("合言葉が違います。");
    expect(alert).toHaveTextContent("LINE");
  });

  it("401以外の失敗はAPIのエラーメッセージを表示する", async () => {
    mockFetchSequence({ ok: false, status: 500, json: { success: false, error: "サーバー設定エラー" } });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByRole("alert")).toHaveTextContent("サーバー設定エラー");
  });

  it("401以外でerrorが無ければ既定メッセージ", async () => {
    mockFetchSequence({ ok: false, status: 500, json: { success: false } });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("ネットワーク例外(非Error)は既定メッセージ", async () => {
    mockFetchSequence("boom");
    render(<ApproveClient />);
    await login();
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });

  it("本文ゼロの500(空ボディ)でも JSON 例外を出さず既定メッセージにフォールバックする(#117)", async () => {
    // route の try/catch 不在や Notion 障害で本文が空の 500 が返るケース。
    // 旧実装は res.json() が「Unexpected end of JSON input」を投げて画面が壊れていた。
    mockFetchSequence({ ok: false, status: 500, text: "" });
    render(<ApproveClient />);
    await login();
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("取得に失敗しました。");
    expect(alert).not.toHaveTextContent("Unexpected end of JSON input");
  });

  it("非JSON(HTMLエラーページ)の500でも既定メッセージにフォールバックする(#117)", async () => {
    mockFetchSequence({ ok: false, status: 500, text: "<html>500</html>" });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByRole("alert")).toHaveTextContent("取得に失敗しました。");
  });
});

describe("ApproveClient 即時保存(#235)", () => {
  it("確定ボタンは無く、進捗(処理済み)を表示する", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.queryByRole("button", { name: /確定/ })).not.toBeInTheDocument();
    expect(screen.getByText("処理済み 0 / 1件")).toBeInTheDocument();
  });

  it("承認を押すとその場で1件保存し、保存済み表示と取り消すを出す", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));

    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取り消す: 市川ページ" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "承認: 市川ページ" })).not.toBeInTheDocument();
    expect(screen.getByText("処理済み 1 / 1件")).toBeInTheDocument();

    const post = fn.mock.calls[1];
    expect(post[0]).toBe(TOKEN_URL);
    expect(post[1].method).toBe("POST");
    expect(JSON.parse(post[1].body)).toEqual({ decisions: [{ id: "p1", decision: "承認" }] });
  });

  it("却下を押すと却下で保存する", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "却下: 市川ページ" }));

    expect(await screen.findByText("却下しました")).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "却下" }],
    });
  });

  it("取り消すで施策を承認待ち(未処理)へ戻し、選択し直せる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 市川ページ" }));

    expect(await screen.findByRole("button", { name: "承認: 市川ページ" })).toBeInTheDocument();
    expect(screen.getByText("処理済み 0 / 1件")).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "未処理" }],
    });
  });

  it("記事の取り消しは提案中へ戻す", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem()] } },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 猛暑記事" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 猛暑記事" }));

    await screen.findByRole("button", { name: "承認: 猛暑記事" });
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      decisions: [{ id: "i1", decision: "提案中" }],
    });
  });

  it("保存失敗時はカードに赤エラーと再試行を出し、選択前の状態を保つ(#239)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { ok: false, status: 502, json: { success: false, error: "保存エラー" } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));

    expect(await screen.findByText("保存エラー")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行: 市川ページ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "承認: 市川ページ" })).toBeInTheDocument();
    expect(screen.getByText("処理済み 0 / 1件")).toBeInTheDocument();
  });

  it("error の無い保存失敗は既定メッセージ(success:false)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: false } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "却下: 市川ページ" }));
    expect(await screen.findByText("保存に失敗しました。")).toBeInTheDocument();
  });

  it("保存中の例外(非Error)は既定メッセージ", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      "boom"
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByText("保存に失敗しました。")).toBeInTheDocument();
  });

  it("再試行で保存をやり直せる(#239)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { ok: false, status: 502, json: { success: false, error: "保存エラー" } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "再試行: 市川ページ" }));

    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(screen.queryByText("保存エラー")).not.toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "承認" }],
    });
  });

  it("1件の保存失敗は他カードに波及しない(#239)", async () => {
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [proposalItem(), proposalItem({ id: "p2", title: "他カード" })],
        },
      },
      { ok: false, status: 502, json: { success: false, error: "保存エラー" } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await screen.findByText("保存エラー");
    await userEvent.click(screen.getByRole("button", { name: "承認: 他カード" }));

    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試行: 市川ページ" })).toBeInTheDocument();
    expect(screen.getByText("処理済み 1 / 2件")).toBeInTheDocument();
  });

  it("取り消し失敗時はカードに赤エラーを出し、保存済みのまま残す(#239)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { ok: false, status: 502, json: { success: false, error: "戻せませんでした" } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 市川ページ" }));

    expect(await screen.findByText("戻せませんでした")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取り消す: 市川ページ" })).toBeInTheDocument();
  });

  it("取り消しの再試行で承認待ちへ戻せる(#239)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { ok: false, status: 502, json: { success: false, error: "戻せませんでした" } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 市川ページ" }));
    await screen.findByText("戻せませんでした");
    await userEvent.click(screen.getByRole("button", { name: "再試行: 市川ページ" }));

    expect(await screen.findByRole("button", { name: "承認: 市川ページ" })).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[3][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "未処理" }],
    });
  });

  it("タップ領域を確保するクラスを付与する(#227)", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.getByRole("button", { name: "承認: 市川ページ" }).className).toMatch(
      /min-h-11/
    );
  });
});

describe("ApproveClient 施策の手動追加(#255)", () => {
  it("施策を追加すると一覧の先頭に承認待ちで増える", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      {
        json: {
          success: true,
          item: {
            id: "n1",
            kind: "proposal",
            title: "手動の施策",
            subtitle: "MEO",
            details: [],
            score: 0,
          },
        },
      }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.getByText("処理済み 0 / 1件")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("施策名"), "手動の施策");
    await userEvent.click(screen.getByRole("button", { name: "追加する" }));

    expect(await screen.findByText("手動の施策")).toBeInTheDocument();
    expect(screen.getByText("処理済み 0 / 2件")).toBeInTheDocument();
  });

  it("0件の空状態からも施策を追加できる", async () => {
    mockFetchSequence({ json: { success: true, items: [] } });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText(/承認待ちはありません/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "追加する" })).toBeInTheDocument();
  });
});

describe("ApproveClient フォーカス管理(#240)", () => {
  it("承認後は取り消すボタンへフォーカスが移る", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByRole("button", { name: "取り消す: 市川ページ" })).toHaveFocus();
  });

  it("取り消し後は承認ボタンへフォーカスが戻る", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await userEvent.click(await screen.findByRole("button", { name: "取り消す: 市川ページ" }));
    expect(await screen.findByRole("button", { name: "承認: 市川ページ" })).toHaveFocus();
  });
});

describe("ApproveClient 合言葉エラーのA11y(#244)", () => {
  it("エラーは入力欄に aria-describedby/aria-invalid で関連付く", async () => {
    mockFetchSequence({ ok: false, status: 401, json: { success: false, error: "認証に失敗しました" } });
    render(<ApproveClient />);
    const input = screen.getByLabelText("合言葉");
    expect(input).not.toHaveAttribute("aria-invalid");

    await login("ちがう");
    await screen.findByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "passphrase-error");
    expect(screen.getByRole("alert")).toHaveAttribute("id", "passphrase-error");
  });

  it("エラー時に入力欄へフォーカスが戻る", async () => {
    mockFetchSequence({ ok: false, status: 401, json: { success: false, error: "x" } });
    render(<ApproveClient />);
    const input = screen.getByLabelText("合言葉");
    await login("ちがう");
    await screen.findByRole("alert");
    expect(input).toHaveFocus();
  });

  it("未入力エラーでも入力欄へフォーカスが戻る", async () => {
    mockFetchSequence();
    render(<ApproveClient />);
    await userEvent.click(screen.getByRole("button", { name: "確認する" }));
    expect(screen.getByLabelText("合言葉")).toHaveFocus();
  });
});

describe("ApproveClient タブ分割/ソート(#242/#90)", () => {
  it("施策タブはレーン降順、記事タブは段階列に分離して表示する(#107/#119)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [
          { id: "p1", kind: "proposal", title: "低スコア施策", subtitle: "", details: [], score: 2, stage: "untouched" },
          { id: "p2", kind: "proposal", title: "高スコア施策", subtitle: "", details: [], score: 9, stage: "untouched" },
          { id: "i1", kind: "idea", title: "記事A", subtitle: "", details: [], score: 1, stage: "proposed" },
        ],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("高スコア施策");

    // #119: 施策と記事はタブで分離。既定(未処理がある施策)タブでは施策レーンのみ。
    expect(screen.getByRole("region", { name: "施策レーン" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "記事パイプライン" })).not.toBeInTheDocument();
    const titles = screen.getAllByText(/スコア施策/).map((el) => el.textContent);
    expect(titles).toEqual(["高スコア施策", "低スコア施策"]); // 優先度降順

    // 記事タブへ切替えると記事パイプラインが出て、施策レーンは消える。
    await selectTab(/記事/);
    expect(screen.getByRole("region", { name: "記事パイプライン" })).toBeInTheDocument();
    expect(screen.getByText("記事A")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "施策レーン" })).not.toBeInTheDocument();
  });

  it("施策のみのときは施策レーンに出る(#107)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [{ id: "p1", kind: "proposal", title: "施策のみ", subtitle: "", details: [], score: 1, stage: "untouched" }],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("施策のみ");
    expect(screen.getByRole("region", { name: "施策レーン" })).toBeInTheDocument();
  });

  it("記事のみのときは施策レーンを出さない(#107)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [{ id: "i1", kind: "idea", title: "記事のみ", subtitle: "", details: [], score: 1, stage: "proposed" }],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("記事のみ");
    expect(screen.queryByRole("region", { name: "施策レーン" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "記事パイプライン" })).toBeInTheDocument();
  });
});

describe("ApproveClient パイプライン盤(#107)", () => {
  it("記事は段階ごとの列に並ぶ(提案中/下書き)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [
          ideaItem({ id: "i1", title: "提案中記事", stage: "proposed" }),
          ideaItem({ id: "i2", title: "下書き記事", stage: "drafted", isDraftReady: true }),
        ],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("提案中記事");

    const proposed = screen.getByRole("region", { name: "列: 提案中" });
    const drafted = screen.getByRole("region", { name: "列: 下書き" });
    expect(within(proposed).getByText("提案中記事")).toBeInTheDocument();
    expect(within(drafted).getByText("下書き記事")).toBeInTheDocument();
  });

  it("列ヘッダに件数バッジを表示する(#107)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [
          proposalItem(),
          proposalItem({ id: "p2", title: "他カード" }),
        ],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    const lane = screen.getByRole("region", { name: "施策レーン" });
    expect(within(lane).getByText("2件")).toBeInTheDocument();
  });

  it("生成待ち列の記事は承認/却下を出さず生成待ち表示にする(#107)", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ id: "i1", title: "承認済み記事", stage: "queued" })] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認済み記事");
    const queued = screen.getByRole("region", { name: "列: 生成待ち" });
    // 列ヘッダ＋カードバッジの両方に「生成待ち」が出る(=カードが状態表示になっている)。
    expect(within(queued).getAllByText("生成待ち").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: "承認: 承認済み記事" })).not.toBeInTheDocument();
  });

  it("生成中の記事は『生成中』バッジを出す(#107)", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ id: "i1", title: "執筆中記事", stage: "generating" })] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("執筆中記事");
    const generating = screen.getByRole("region", { name: "列: 生成中" });
    expect(within(generating).getAllByText("生成中").length).toBeGreaterThanOrEqual(2);
  });

  it("承認済みの施策はレーンで『承認済み』表示にする(#107)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [proposalItem({ id: "p9", title: "承認済み施策", stage: "approved" })],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("承認済み施策");
    const lane = screen.getByRole("region", { name: "施策レーン" });
    expect(within(lane).getByText("承認済み")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "承認: 承認済み施策" })).not.toBeInTheDocument();
  });

  it("承認するとカードが生成待ち列へ移動し、取り消せる(#107)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ id: "i1", title: "前進記事", stage: "proposed" })] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("前進記事");

    await userEvent.click(screen.getByRole("button", { name: "承認: 前進記事" }));

    // 生成待ち列へ移り、決定済みカード(取り消し導線)が出る。消えない。
    const queued = screen.getByRole("region", { name: "列: 生成待ち" });
    expect(await within(queued).findByText("承認しました")).toBeInTheDocument();
    expect(
      within(queued).getByRole("button", { name: "取り消す: 前進記事" })
    ).toBeInTheDocument();
  });
});

describe("ApproveClient 公開タイミングの明示(#237)", () => {
  it("承認＝制作キュー追加・この場では非公開の補足を表示する", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.getByText(/この場では公開されません/)).toBeInTheDocument();
  });

  it("完了表示に公開タイミングの注記を含む", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByText(/公開はまだされません/)).toBeInTheDocument();
  });
});

describe("ApproveClient 空状態/完了(#236)", () => {
  it("承認待ち0件のとき空状態を表示し、操作ボタンを出さない", async () => {
    mockFetchSequence({ json: { success: true, items: [] } });
    render(<ApproveClient />);
    await login();
    expect(await screen.findByText(/承認待ちはありません/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /確定/ })).not.toBeInTheDocument();
  });

  it("全件処理すると完了メッセージを表示する", async () => {
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByText(/すべて処理しました/)).toBeInTheDocument();
  });

  it("一部未処理なら完了メッセージは出ない", async () => {
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [proposalItem(), proposalItem({ id: "p2", title: "他カード" })],
        },
      },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await screen.findByText("承認しました");
    expect(screen.queryByText(/すべて処理しました/)).not.toBeInTheDocument();
  });
});

describe("ApproveClient master-detail/詳細パネル(#275)", () => {
  it("一覧は高密度化し、詳細はインライン展開せず『詳細』ボタンを出す", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    expect(screen.queryByText("詳細を見る")).not.toBeInTheDocument();
    expect(screen.queryByText("優先度スコア")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "詳細: 市川ページ" })).toBeInTheDocument();
  });

  it("詳細ボタンでパネルを開き、閉じるボタンで閉じる", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("市川ページ")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("背景(オーバーレイ)クリックでパネルを閉じる", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    await screen.findByRole("dialog");
    await userEvent.click(screen.getByRole("button", { name: "オーバーレイを閉じる" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("パネルから承認するとその場で保存し、パネルが閉じる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "承認" }));

    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "承認" }],
    });
  });

  it("パネルから却下もできる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "却下" }));

    expect(await screen.findByText("却下しました")).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "却下" }],
    });
  });

  it("処理済みの詳細パネルから承認待ちへ戻せる", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await showAll();
    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    await screen.findByText("承認しました");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "承認待ちに戻す" }));

    expect(await screen.findByRole("button", { name: "承認: 市川ページ" })).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      decisions: [{ id: "p1", decision: "未処理" }],
    });
  });

  it("詳細パネルから『準備中』の下書き生成・AI壁打ちプレースホルダを削除した(#124)", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: "下書きを生成" })
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("AI壁打ち（準備中）")).not.toBeInTheDocument();
  });

  it("詳細パネルに記事の仮説(#S4)を表示する", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [
          ideaItem({
            hypothesis: {
              articleType: "獲得",
              targetReader: "本八幡近隣の初心者",
              searchIntent: "始め方を知りたい",
              winningAngle: "一次情報＋内部リンク",
              plannedCta: ["予約", "LINE"],
              successMetric: "予約クリック10件/月",
            },
          }),
        ],
      },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("記事の仮説")).toBeInTheDocument();
    expect(within(dialog).getByText("本八幡近隣の初心者")).toBeInTheDocument();
    expect(within(dialog).getByText("予約")).toBeInTheDocument();
  });

  it("施策の詳細パネルにも準備中プレースホルダは無い(#124)", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).queryByRole("button", { name: "下書きを生成" })
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("AI壁打ち（準備中）")).not.toBeInTheDocument();
  });

  it("details も subtitle も無い項目でも詳細パネルを開ける", async () => {
    mockFetchSequence({
      json: { success: true, items: [{ id: "p1", kind: "proposal", title: "A", subtitle: "" }] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("A");
    await userEvent.click(screen.getByRole("button", { name: "詳細: A" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });
});

describe("ApproveClient 下書きタブ(#87)", () => {
  function draftIdea(over: Partial<Record<string, unknown>> = {}) {
    return ideaItem({
      id: "d1",
      title: "下書き記事",
      isDraftReady: true,
      contentId: "g-1",
      stage: "drafted",
      ...over,
    });
  }

  it("下書き作成済みは「下書き」列に入る(#107)", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem(), draftIdea()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    // 提案中記事は提案中列、下書き記事は下書き列。
    const proposed = screen.getByRole("region", { name: "列: 提案中" });
    const drafted = screen.getByRole("region", { name: "列: 下書き" });
    expect(within(proposed).getByText("猛暑記事")).toBeInTheDocument();
    expect(within(drafted).getByText("下書き記事")).toBeInTheDocument();
  });

  it("下書き行は承認/却下を出さず、詳細のみ表示する", async () => {
    mockFetchSequence({ json: { success: true, items: [draftIdea()] } });
    render(<ApproveClient />);
    await login();
    // 下書きのみ → 既定タブが無く下書きタブへフォールバック
    await screen.findByText("下書き記事");
    expect(screen.queryByRole("button", { name: "承認: 下書き記事" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "却下: 下書き記事" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "詳細: 下書き記事" })).toBeInTheDocument();
  });

  it("下書きの詳細パネルには承認/却下を出さない", async () => {
    mockFetchSequence(
      { json: { success: true, items: [draftIdea()] } },
      { json: { success: true, exists: false } }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("下書き記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 下書き記事" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "承認" })).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "却下" })).not.toBeInTheDocument();
  });
});

describe("ApproveClient 構成案修正(#42/#53)", () => {
  async function openIdeaPanel() {
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    return screen.findByRole("dialog");
  }

  // GitHub風オンデマンド: ＋コメント → 入力 → コメントを追加。
  // 差分B: AIコメント依頼はドロワーへ移ったため、操作対象はドロワー(または手動編集用の dialog)。
  async function addComment(container: HTMLElement, heading: string, text: string) {
    await userEvent.click(within(container).getByRole("button", { name: `コメントを追加: ${heading}` }));
    await userEvent.type(within(container).getByLabelText(`コメント入力: ${heading}`), text);
    await userEvent.click(within(container).getByRole("button", { name: "コメントを追加" }));
  }

  it("見出しごとにオンデマンドでコメントし、まとめて修正を依頼できる", async () => {
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          // 2件あっても依頼対象(i1)だけ楽観更新する。
          items: [
            ideaItem({ outline: "## 見出しA\n## 見出しB" }),
            ideaItem({ id: "i2", title: "別の記事", outline: "## C" }),
          ],
        },
      },
      { json: { success: true } }
    );
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    expect(within(drawer).getByText("見出しA")).toBeInTheDocument();
    expect(within(drawer).getByText("見出しB")).toBeInTheDocument();
    // コメント0件のうちは依頼ボタンが無効
    expect(within(drawer).getByRole("button", { name: "修正を依頼" })).toBeDisabled();

    await addComment(drawer, "見出しA", "3つを箇条書きで");
    // コメントがスレッド表示され、件数バッジが出る
    expect(within(drawer).getByText("3つを箇条書きで")).toBeInTheDocument();
    expect(within(drawer).getByText("コメント1")).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: "修正を依頼（コメント1件）" }));
    // 依頼後はドロワー内の相談カードが処理中(待ち)表示へ移る。
    expect(await within(drawer).findByText(/AIが処理中です/)).toBeInTheDocument();
    const post = fn.mock.calls[1];
    // 認証有効時は token をクエリで送る(送らないと 401「認証に失敗しました」になる)。
    expect(post[0]).toBe("/api/growth/revise");
    expect(JSON.parse(post[1].body)).toEqual({
      pageId: "i1",
      comments: [{ line: "見出しA", comment: "3つを箇条書きで" }],
    });
  });

  it("セクションの見出しと1行説明を表示する", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [ideaItem({ outline: "## 市川でできる場所は3つ\n屋外/体育館/屋内専用を整理" })],
      },
    });
    const dialog = await openIdeaPanel();
    expect(within(dialog).getByText("市川でできる場所は3つ")).toBeInTheDocument();
    expect(within(dialog).getByText("屋外/体育館/屋内専用を整理")).toBeInTheDocument();
  });

  it("1セクションに複数コメントを溜められる(件数バッジ・展開送信)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { json: { success: true } }
    );
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    await addComment(drawer, "A", "1つ目");
    await addComment(drawer, "A", "2つ目");
    expect(within(drawer).getByText("コメント2")).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: "修正を依頼（コメント2件）" }));
    await within(drawer).findByText(/AIが処理中です/);
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      pageId: "i1",
      comments: [
        { line: "A", comment: "1つ目" },
        { line: "A", comment: "2つ目" },
      ],
    });
  });

  it("コメントを編集・削除できる(送信前)", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem({ outline: "## A" })] } });
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    await addComment(drawer, "A", "最初の文");

    // 編集
    await userEvent.click(within(drawer).getByRole("button", { name: "コメントを編集: A 1" }));
    const editor = within(drawer).getByLabelText("コメント入力: A");
    await userEvent.clear(editor);
    await userEvent.type(editor, "直した文");
    await userEvent.click(within(drawer).getByRole("button", { name: "更新" }));
    expect(within(drawer).getByText("直した文")).toBeInTheDocument();

    // 削除 → バッジも消え、依頼は無効に戻る
    await userEvent.click(within(drawer).getByRole("button", { name: "コメントを削除: A 1" }));
    expect(within(drawer).queryByText("直した文")).not.toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "修正を依頼" })).toBeDisabled();
  });

  it("コメント入力をキャンセルでき、空のまま追加しても増えない", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem({ outline: "## A" })] } });
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    // キャンセル
    await userEvent.click(within(drawer).getByRole("button", { name: "コメントを追加: A" }));
    await userEvent.click(within(drawer).getByRole("button", { name: "キャンセル" }));
    expect(within(drawer).queryByLabelText("コメント入力: A")).not.toBeInTheDocument();
    // 空のまま「コメントを追加」→ 何も増えない
    await userEvent.click(within(drawer).getByRole("button", { name: "コメントを追加: A" }));
    await userEvent.click(within(drawer).getByRole("button", { name: "コメントを追加" }));
    expect(within(drawer).queryByText("コメント1")).not.toBeInTheDocument();
  });

  it("修正処理中(409)は専用メッセージを出す", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { ok: false, status: 409, json: { success: false, error: "x" } }
    );
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    await addComment(drawer, "A", "直して");
    await userEvent.click(within(drawer).getByRole("button", { name: "修正を依頼（コメント1件）" }));
    expect(await within(drawer).findByText(/修正処理中/)).toBeInTheDocument();
  });

  it("既に修正中(reviseStatus)の記事は相談カードを処理中表示にする", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A", reviseStatus: "処理中" })] },
    });
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    // 提示待ち(処理中)はドロワーの相談カードが処理中表示になる。
    expect(within(drawer).getByText(/AIが処理中です/)).toBeInTheDocument();
  });

  it("API エラー(error付き)はその内容を表示する", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { ok: false, status: 500, json: { success: false, error: "サーバー設定エラー" } }
    );
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    await addComment(drawer, "A", "直して");
    await userEvent.click(within(drawer).getByRole("button", { name: "修正を依頼（コメント1件）" }));
    expect(await within(drawer).findByText("サーバー設定エラー")).toBeInTheDocument();
  });

  it("error の無い失敗は既定メッセージ", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { json: { success: false } }
    );
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    await addComment(drawer, "A", "直して");
    await userEvent.click(within(drawer).getByRole("button", { name: "修正を依頼（コメント1件）" }));
    expect(await within(drawer).findByText("修正依頼に失敗しました。")).toBeInTheDocument();
  });

  it("見出しが重複してもコメントはセクションごとに独立する(index キー)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## まとめ\n## まとめ" })] } },
      { json: { success: true } }
    );
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    // 2つ目のセクションにだけコメント
    const addButtons = within(drawer).getAllByRole("button", { name: "コメントを追加: まとめ" });
    expect(addButtons).toHaveLength(2);
    await userEvent.click(addButtons[1]);
    await userEvent.type(within(drawer).getByLabelText("コメント入力: まとめ"), "2つ目だけ直す");
    await userEvent.click(within(drawer).getByRole("button", { name: "コメントを追加" }));
    await userEvent.click(within(drawer).getByRole("button", { name: "修正を依頼（コメント1件）" }));

    await within(drawer).findByText(/AIが処理中です/);
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      pageId: "i1",
      comments: [{ line: "まとめ", comment: "2つ目だけ直す" }],
    });
  });

  it("セクションを手動編集して直接保存できる(他セクションは保持)(#54)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A\n旧説明\n\n## B\n別説明" })] } },
      { json: { success: true } },
      { json: { success: true, items: [ideaItem({ outline: "## A改\n新説明\n\n## B\n別説明" })] } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "セクションを編集: A" }));
    const heading = within(dialog).getByLabelText("見出しを編集: A");
    await userEvent.clear(heading);
    await userEvent.type(heading, "A改");
    const desc = within(dialog).getByLabelText("説明を編集: A");
    await userEvent.clear(desc);
    await userEvent.type(desc, "新説明");
    await userEvent.click(within(dialog).getByRole("button", { name: "この行を保存" }));

    expect(await within(dialog).findByText("A改")).toBeInTheDocument();
    expect(within(dialog).getByText("新説明")).toBeInTheDocument();
    // 他セクション(B)は保持される
    expect(within(dialog).getByText("B")).toBeInTheDocument();
    const post = fn.mock.calls[1];
    expect(post[0]).toBe("/api/growth/revise/edit");
    expect(JSON.parse(post[1].body)).toEqual({
      pageId: "i1",
      outline: "## A改\n新説明\n\n## B\n別説明",
    });
  });

  it("見出しを空にすると保存できない(#54)", async () => {
    const fn = mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A" })] },
    });
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "セクションを編集: A" }));
    await userEvent.clear(within(dialog).getByLabelText("見出しを編集: A"));
    await userEvent.click(within(dialog).getByRole("button", { name: "この行を保存" }));
    expect(await within(dialog).findByText(/見出しは空にできません/)).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(1); // login のみ・POST なし
  });

  it("AI修正処理中は手動保存できない(409)(#54)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { ok: false, status: 409, json: { success: false, error: "x" } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "セクションを編集: A" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "この行を保存" }));
    expect(await within(dialog).findByText(/AI修正処理中/)).toBeInTheDocument();
  });

  it("手動保存の失敗(error付き/なし)を表示する(#54)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { ok: false, status: 502, json: { success: false, error: "保存中にエラーが発生しました" } },
      { json: { success: false } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "セクションを編集: A" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "この行を保存" }));
    expect(await within(dialog).findByText("保存中にエラーが発生しました")).toBeInTheDocument();
    // 2回目: error なし → 既定メッセージ
    await userEvent.click(within(dialog).getByRole("button", { name: "この行を保存" }));
    expect(await within(dialog).findByText("保存に失敗しました。")).toBeInTheDocument();
  });

  it("手動編集をキャンセルできる(#54)", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem({ outline: "## A" })] } });
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "セクションを編集: A" }));
    expect(within(dialog).getByLabelText("見出しを編集: A")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(within(dialog).queryByLabelText("見出しを編集: A")).not.toBeInTheDocument();
    expect(within(dialog).getByText("A")).toBeInTheDocument();
  });

  it("構成案が無い記事では修正セクションを出さない", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    const dialog = await openIdeaPanel();
    expect(
      within(dialog).queryByRole("button", { name: /修正を依頼/ })
    ).not.toBeInTheDocument();
  });

  // #139 A: 記事タイトルの直接編集。
  it("タイトルを直接編集して保存できる(#139 A)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { json: { success: true } }, // POST /revise/edit
      { json: { success: true, items: [ideaItem({ outline: "## A", title: "新タイトル" })] } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトルを編集: 猛暑記事" }));
    const input = within(dialog).getByLabelText("タイトルを編集");
    await userEvent.clear(input);
    await userEvent.type(input, "新タイトル");
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトルを保存" }));

    // 反映: ヘッダー・タイトル行とも新タイトルに更新され、編集フォームは閉じる。
    expect((await within(dialog).findAllByText("新タイトル")).length).toBeGreaterThan(0);
    expect(within(dialog).queryByLabelText("タイトルを編集")).not.toBeInTheDocument();
    const post = fn.mock.calls[1];
    expect(post[0]).toBe("/api/growth/revise/edit");
    expect(JSON.parse(post[1].body)).toEqual({ pageId: "i1", title: "新タイトル" });
  });

  it("タイトルを空にすると保存できない(#139 A)", async () => {
    const fn = mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A" })] },
    });
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトルを編集: 猛暑記事" }));
    await userEvent.clear(within(dialog).getByLabelText("タイトルを編集"));
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトルを保存" }));
    expect(await within(dialog).findByText(/タイトルは空にできません/)).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(1); // login のみ・POST なし
  });

  it("タイトル編集をキャンセルできる(#139 A)", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem({ outline: "## A" })] } });
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトルを編集: 猛暑記事" }));
    expect(within(dialog).getByLabelText("タイトルを編集")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトル編集をキャンセル" }));
    expect(within(dialog).queryByLabelText("タイトルを編集")).not.toBeInTheDocument();
  });

  it("タイトル保存が失敗(AI修正処理中=409)なら編集フォームを保持する(#139 A)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { ok: false, status: 409, json: { success: false, error: "x" } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトルを編集: 猛暑記事" }));
    const input = within(dialog).getByLabelText("タイトルを編集");
    await userEvent.clear(input);
    await userEvent.type(input, "新T");
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトルを保存" }));
    expect(await within(dialog).findByText(/AI修正処理中/)).toBeInTheDocument();
    // false 分岐: 保存失敗時は編集フォームを閉じない。
    expect(within(dialog).getByLabelText("タイトルを編集")).toBeInTheDocument();
  });

  // #61: 画像指示エディタ(スタイル選択＋説明・チップ・追加/編集/削除)。
  it("構成案の画像指示をスタイルバッジ＋説明のチップで表示する", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [ideaItem({ outline: "## A\n説明\n[画像:詳しい図解: コート図]" })],
      },
    });
    const dialog = await openIdeaPanel();
    expect(within(dialog).getByText("詳しい図解")).toBeInTheDocument();
    expect(within(dialog).getByText("コート図")).toBeInTheDocument();
    // 1枚あるので ＋画像 ボタンは「1 / 3」を表示
    expect(
      within(dialog).getByRole("button", { name: "画像を追加: A" })
    ).toHaveTextContent("1 / 3");
  });

  it("＋画像でスタイルを選び説明を入力して追加する(他セクションは保持)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A\n説明\n\n## B\n別説明" })] } },
      { json: { success: true } },
      {
        json: {
          success: true,
          items: [
            ideaItem({ outline: "## A\n説明\n[画像:詳しい図解: コート図]\n\n## B\n別説明" }),
          ],
        },
      }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "画像を追加: A" }));
    await userEvent.selectOptions(within(dialog).getByLabelText("スタイル"), "diagram");
    await userEvent.type(within(dialog).getByLabelText("画像の説明: A"), "コート図");
    await userEvent.click(within(dialog).getByRole("button", { name: "追加" }));

    expect(await within(dialog).findByText("コート図")).toBeInTheDocument();
    expect(within(dialog).getByText("詳しい図解")).toBeInTheDocument();
    const post = fn.mock.calls[1];
    expect(post[0]).toBe("/api/growth/revise/edit");
    // 追加したセクション(A)だけにトークンが入り、他セクション(B)は保持される
    expect(JSON.parse(post[1].body)).toEqual({
      pageId: "i1",
      outline: "## A\n説明\n[画像:詳しい図解: コート図]\n\n## B\n別説明",
    });
  });

  it("複数画像のうち1枚だけ編集して更新できる(他画像は保持)", async () => {
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          items: [ideaItem({ outline: "## A\n[画像:ミニマル図解: 旧1]\n[画像:詳しい図解: 旧2]" })],
        },
      },
      { json: { success: true } },
      {
        json: {
          success: true,
          items: [ideaItem({ outline: "## A\n[画像:ミニマル図解: 新1]\n[画像:詳しい図解: 旧2]" })],
        },
      }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "画像を編集: A 1" }));
    const desc = within(dialog).getByLabelText("画像の説明: A");
    await userEvent.clear(desc);
    await userEvent.type(desc, "新1");
    await userEvent.click(within(dialog).getByRole("button", { name: "更新" }));

    expect(await within(dialog).findByText("新1")).toBeInTheDocument();
    // 2枚目(旧2)は保持される
    expect(JSON.parse(fn.mock.calls[1][1].body).outline).toBe(
      "## A\n[画像:ミニマル図解: 新1]\n[画像:詳しい図解: 旧2]"
    );
  });

  it("画像指示を削除できる(他セクションは保持)", async () => {
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          items: [ideaItem({ outline: "## A\n[画像:詳しい図解: 図]\n\n## B\n別" })],
        },
      },
      { json: { success: true } },
      { json: { success: true, items: [ideaItem({ outline: "## A\n\n## B\n別" })] } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "画像を削除: A 1" }));

    // 反映後はチップが消える
    await within(dialog).findByRole("button", { name: "画像を追加: A" });
    expect(within(dialog).queryByText("図")).not.toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[1][1].body).outline).toBe("## A\n\n## B\n別");
  });

  it("説明が空の画像は追加できない(POSTしない)", async () => {
    const fn = mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A" })] },
    });
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "画像を追加: A" }));
    await userEvent.click(within(dialog).getByRole("button", { name: "追加" }));
    expect(await within(dialog).findByText(/画像の説明を入力してください/)).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(1); // login のみ
  });

  it("画像が3枚あると＋画像を無効化する(上限)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [
          ideaItem({
            outline:
              "## A\n[画像:詳しい図解: 1]\n[画像:ミニマル図解: 2]\n[画像:マスコット・コスミック: 3]",
          }),
        ],
      },
    });
    const dialog = await openIdeaPanel();
    const addBtn = within(dialog).getByRole("button", { name: "画像を追加: A" });
    expect(addBtn).toHaveTextContent("3 / 3");
    expect(addBtn).toBeDisabled();
  });

  it("画像追加が409なら専用メッセージを出し、フォームは閉じない", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { ok: false, status: 409, json: { success: false, error: "x" } }
    );
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "画像を追加: A" }));
    await userEvent.type(within(dialog).getByLabelText("画像の説明: A"), "図");
    await userEvent.click(within(dialog).getByRole("button", { name: "追加" }));
    expect(await within(dialog).findByText(/AI修正処理中/)).toBeInTheDocument();
    // 失敗時はフォームを閉じない(入力をやり直せる)
    expect(within(dialog).getByLabelText("画像の説明: A")).toBeInTheDocument();
  });

  it("画像追加フォームをキャンセルできる", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem({ outline: "## A" })] } });
    const dialog = await openIdeaPanel();
    await userEvent.click(within(dialog).getByRole("button", { name: "画像を追加: A" }));
    expect(within(dialog).getByLabelText("画像の説明: A")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "キャンセル" }));
    expect(within(dialog).queryByLabelText("画像の説明: A")).not.toBeInTheDocument();
  });
});

describe("ApproveClient 構成案修正の提示・反映(#43)", () => {
  async function openIdea() {
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    return screen.findByRole("dialog");
  }

  it("最新を確認で提示を取得し、反映で構成案を更新する", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A", reviseStatus: "処理中" })] } },
      {
        json: {
          success: true,
          items: [ideaItem({ outline: "## A", reviseStatus: "提示中", reviseProposal: "## A 改" })],
        },
      },
      { json: { success: true } },
      { json: { success: true, items: [ideaItem({ outline: "## A 改" })] } }
    );
    const dialog = await openIdea();
    const drawer = await openConsultDrawer(dialog);
    expect(within(drawer).getByText(/AIが処理中です/)).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: "再読み込み" }));
    expect(await within(drawer).findByText("## A 改")).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: "反映する" }));
    // 反映後は依頼状態が「なし」へ戻り、相談カードは消える(待ち/提示が無くなる)。
    await waitFor(() =>
      expect(within(drawer).queryByText("## A 改")).not.toBeInTheDocument()
    );
    // 認証有効時は token をクエリで送る(送らないと 401 になる)。
    expect(fn.mock.calls[2][0]).toBe("/api/growth/revise/apply");
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({ pageId: "i1", action: "apply" });
  });

  it("元の構成案が未設定でも修正案の差分を表示する(#M4・outline欠落)", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [ideaItem({ reviseStatus: "提示中", reviseProposal: "## 新しい構成" })],
      },
    });
    const dialog = await openIdea();
    const drawer = await openConsultDrawer(dialog);
    expect(await within(drawer).findByLabelText("元と新の差分")).toBeInTheDocument();
  });

  it("やり直しで修正案を破棄し、再コメントできる", async () => {
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          items: [ideaItem({ outline: "## A", reviseStatus: "提示中", reviseProposal: "## A 改" })],
        },
      },
      { json: { success: true } },
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } }
    );
    const dialog = await openIdea();
    const drawer = await openConsultDrawer(dialog);
    await userEvent.click(within(drawer).getByRole("button", { name: "やり直し" }));
    // 破棄後は提示が消え、依頼フォーム(修正を依頼)に戻る。
    await waitFor(() =>
      expect(within(drawer).queryByText("## A 改")).not.toBeInTheDocument()
    );
    expect(within(drawer).getByRole("button", { name: "修正を依頼" })).toBeInTheDocument();
    expect(fn.mock.calls[1][0]).toBe("/api/growth/revise/apply");
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({ pageId: "i1", action: "discard" });
  });

  it("失敗時は理由を出し、再依頼へ戻れる", async () => {
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          items: [ideaItem({ outline: "## A", reviseStatus: "失敗", reviseProposal: "タイムアウト" })],
        },
      },
      { json: { success: true } }
    );
    const dialog = await openIdea();
    const drawer = await openConsultDrawer(dialog);
    expect(within(drawer).getByText(/生成に失敗しました/)).toBeInTheDocument();
    expect(within(drawer).getByText("タイムアウト")).toBeInTheDocument();
    // 失敗カードの「再依頼する」は revise を再依頼する。
    await userEvent.click(within(drawer).getByRole("button", { name: "再依頼する" }));
    await waitFor(() =>
      expect(fn.mock.calls[1][0]).toBe("/api/growth/revise")
    );
  });

  it("失敗で理由が空なら既定文言を出す", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A", reviseStatus: "失敗" })] },
    });
    const dialog = await openIdea();
    const drawer = await openConsultDrawer(dialog);
    expect(within(drawer).getByText(/生成に失敗しました/)).toBeInTheDocument();
    expect(within(drawer).getByText("外部処理が応答しませんでした。")).toBeInTheDocument();
  });

  it("反映APIのエラーを表示する", async () => {
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [ideaItem({ outline: "## A", reviseStatus: "提示中", reviseProposal: "## A 改" })],
        },
      },
      { ok: false, status: 409, json: { success: false, error: "反映できるのは提示中のときだけです。" } }
    );
    const dialog = await openIdea();
    const drawer = await openConsultDrawer(dialog);
    await userEvent.click(within(drawer).getByRole("button", { name: "反映する" }));
    expect(
      await within(drawer).findByText("反映できるのは提示中のときだけです。")
    ).toBeInTheDocument();
  });

  it("反映APIの error なし失敗は既定メッセージ", async () => {
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [ideaItem({ outline: "## A", reviseStatus: "提示中", reviseProposal: "## A 改" })],
        },
      },
      { json: { success: false } }
    );
    const dialog = await openIdea();
    const drawer = await openConsultDrawer(dialog);
    await userEvent.click(within(drawer).getByRole("button", { name: "反映する" }));
    expect(await within(drawer).findByText("更新に失敗しました。")).toBeInTheDocument();
  });

  it("最新取得の失敗(非Error)は既定メッセージ", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A", reviseStatus: "処理中" })] } },
      "boom"
    );
    const dialog = await openIdea();
    const drawer = await openConsultDrawer(dialog);
    await userEvent.click(within(drawer).getByRole("button", { name: "再読み込み" }));
    expect(await within(drawer).findByText("最新の取得に失敗しました。")).toBeInTheDocument();
  });

  it("修正中(処理中)は一覧・パネルの承認/却下を無効化する", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A", reviseStatus: "処理中" })] },
    });
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    // 一覧の承認ボタンが無効
    expect(screen.getByRole("button", { name: "承認: 猛暑記事" })).toBeDisabled();
    // パネルでも無効
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "承認" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "却下" })).toBeDisabled();
  });

  it("提示待ちの間は自動で再取得して提示へ移る(ポーリング)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockFetchSequence(
        { json: { success: true, items: [ideaItem({ outline: "## A", reviseStatus: "依頼中" })] } },
        {
          json: {
            success: true,
            items: [ideaItem({ outline: "## A", reviseStatus: "提示中", reviseProposal: "## A 改" })],
          },
        }
      );
      flags.authEnabled = false; // 自動取得(ログイン不要)
      render(<ApproveClient />);
      await screen.findByText("猛暑記事");
      await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
      const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
      await userEvent.click(within(dialog).getByRole("button", { name: "AIに相談" }));
      const drawer = await screen.findByRole("dialog", { name: "AIに相談" });
      await vi.advanceTimersByTimeAsync(5100);
      expect(await within(drawer).findByText("## A 改")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ApproveClient タイトルのAI修正(#139 B)", () => {
  async function openIdea(over: Record<string, unknown> = {}) {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## A", ...over })] },
    });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    return openConsultDrawer(dialog);
  }

  it("タイトル指示だけでも『修正を依頼』でき、titleInstruction を送る", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ outline: "## A" })] } },
      { json: { success: true } },
      { json: { success: true, items: [ideaItem({ outline: "## A", reviseStatus: "依頼中" })] } }
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    const drawer = await openConsultDrawer(dialog);

    // 構成案コメントが無くてもタイトル指示があれば依頼ボタンが有効になる。
    expect(within(drawer).getByRole("button", { name: "修正を依頼" })).toBeDisabled();
    await userEvent.type(
      within(drawer).getByLabelText("タイトルについて（AIに修正を依頼）"),
      "市川を入れて短く"
    );
    const submit = within(drawer).getByRole("button", { name: "修正を依頼" });
    expect(submit).toBeEnabled();
    await userEvent.click(submit);

    expect(await within(drawer).findByText(/AIが処理中です/)).toBeInTheDocument();
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({
      pageId: "i1",
      comments: [],
      titleInstruction: "市川を入れて短く",
    });
  });

  it("提示中はタイトルの新旧比較を表示し、反映できる", async () => {
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          items: [
            ideaItem({
              outline: "## A",
              title: "元タイトル",
              reviseStatus: "提示中",
              reviseTitleProposal: "短い新タイトル",
            }),
          ],
        },
      },
      { json: { success: true } },
      { json: { success: true, items: [ideaItem({ outline: "## A", title: "短い新タイトル" })] } }
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 元タイトル" }));
    const dialog = await screen.findByRole("dialog");
    const drawer = await openConsultDrawer(dialog);

    expect(within(drawer).getByText("タイトルの修正案")).toBeInTheDocument();
    expect(within(drawer).getByText("短い新タイトル")).toBeInTheDocument();

    await userEvent.click(within(drawer).getByRole("button", { name: "反映する" }));
    expect(JSON.parse(fn.mock.calls[1][1].body)).toEqual({ pageId: "i1", action: "apply" });
  });

  it("タイトルのみの提示では構成案の新旧比較を出さない", async () => {
    const drawer = await openIdea({
      reviseStatus: "提示中",
      reviseTitleProposal: "新タイトル案",
    });
    expect(within(drawer).getByText("タイトルの修正案")).toBeInTheDocument();
    expect(within(drawer).queryByText("元の構成案")).not.toBeInTheDocument();
  });

  it("構成案のみの提示ではタイトルの新旧比較を出さない", async () => {
    const drawer = await openIdea({
      reviseStatus: "提示中",
      reviseProposal: "## A 改",
    });
    expect(within(drawer).getByText("元の構成案")).toBeInTheDocument();
    expect(within(drawer).queryByText("タイトルの修正案")).not.toBeInTheDocument();
  });
});

describe("ApproveClient 合言葉認証オフ(#36 一時措置)", () => {
  beforeEach(() => {
    flags.authEnabled = false;
  });

  it("ゲートを出さず、合言葉なし(token空)で承認待ちを直接取得・表示する", async () => {
    const fn = mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);

    expect(await screen.findByText("市川ページ")).toBeInTheDocument();
    // 合言葉入力欄(ゲート)は出さない
    expect(screen.queryByLabelText("合言葉")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "確認する" })).not.toBeInTheDocument();
    // token を付けずに取得する(空 token)
    expect(fn.mock.calls[0][0]).toBe("/api/growth/approve");
  });

  it("承認の保存も token なし(空)で送る", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    await showAll();

    await userEvent.click(screen.getByRole("button", { name: "承認: 市川ページ" }));
    expect(await screen.findByText("承認しました")).toBeInTheDocument();
    expect(fn.mock.calls[1][0]).toBe("/api/growth/approve");
  });

  it("自動取得が失敗したらエラーと再読み込みを出し、再取得で復帰する", async () => {
    mockFetchSequence(
      { ok: false, status: 500, json: { success: false, error: "サーバー設定エラー" } },
      { json: { success: true, items: [proposalItem()] } }
    );
    render(<ApproveClient />);

    expect(await screen.findByRole("alert")).toHaveTextContent("サーバー設定エラー");
    await userEvent.click(screen.getByRole("button", { name: "再読み込み" }));
    expect(await screen.findByText("市川ページ")).toBeInTheDocument();
  });
});

describe("ApproveClient 下書きプレビュー(#75)", () => {
  async function openIdeaPanel() {
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    return screen.findByRole("dialog");
  }

  const draftReady = (bodyHtml: string) => ({
    json: {
      success: true,
      exists: true,
      draft: { title: "T", displayMode: "html", bodyHtml, body: "" },
    },
  });

  it("contentId のある記事はパネルを開くと実プレビューを表示する", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      draftReady("<p>下書き本文です</p>")
    );
    const dialog = await openIdeaPanel();
    // #100: 本文は iframe(本番テーマ)内で描画されるため、観測点 data-preview-html を検証する。
    const frame = await within(dialog).findByTitle("本番プレビュー");
    expect(frame).toHaveAttribute("data-preview-html", "<p>下書き本文です</p>");
    // 取得APIに pageId+token 付きで GET している
    expect(String(fn.mock.calls[1][0])).toContain("/api/growth/draft?pageId=i1");
  });

  it("インラインコメントを投稿してAIに依頼し、下書きを再取得する(#182)", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      draftReady("<p>一文目です。</p>"),
      { json: { success: true } }, // POST /api/growth/body-comment
      draftReady("<p>一文目です。</p>") // onChanged 後の再取得
    );
    const dialog = await openIdeaPanel();
    const drawer = await openConsultDrawer(dialog);
    await selectConsultTab(drawer, "この文を直す");
    await within(drawer).findByLabelText("1行目にコメント");
    await userEvent.click(within(drawer).getByRole("button", { name: "1行目にコメント" }));
    await userEvent.type(within(drawer).getByLabelText("1行目へのコメント入力"), "やわらかく");
    await userEvent.click(within(drawer).getByRole("button", { name: "コメント" }));
    await userEvent.click(within(drawer).getByRole("button", { name: /AIに指摘を依頼/ }));
    await waitFor(() =>
      expect(String(fn.mock.calls[2][0])).toContain("/api/growth/body-comment")
    );
    expect(JSON.parse(fn.mock.calls[2][1].body)).toEqual({
      pageId: "i1",
      comments: [{ blockIndex: 0, excerpt: "一文目です。", comment: "やわらかく" }],
    });
    // onChanged → 下書き再取得(GET)まで呼ばれる
    await waitFor(() => expect(fn.mock.calls.length).toBeGreaterThanOrEqual(4));
  });

  it("bodyHtml が空でも body にフォールバックしてプレビューへ渡す(#100)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "", body: "<p>リッチ本文</p>" },
        },
      }
    );
    const dialog = await openIdeaPanel();
    const frame = await within(dialog).findByTitle("本番プレビュー");
    expect(frame).toHaveAttribute("data-preview-html", "<p>リッチ本文</p>");
  });

  it("contentId が無い記事は取得せず『未作成』を表示する", async () => {
    const fn = mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    const dialog = await openIdeaPanel();
    expect(within(dialog).getByText(/まだ下書きは生成されていません/)).toBeInTheDocument();
    expect(fn).toHaveBeenCalledTimes(1); // login のみ・下書き取得は呼ばない
  });

  it("下書きが取れない(exists:false)は『見つかりませんでした』", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      { json: { success: true, exists: false, draft: null } }
    );
    const dialog = await openIdeaPanel();
    expect(await within(dialog).findByText(/見つかりませんでした/)).toBeInTheDocument();
  });

  it("取得失敗はエラー表示し、再読み込みで再取得できる", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      { ok: false, status: 502, json: { success: false, error: "下書きの取得に失敗しました" } },
      draftReady("<p>復活しました</p>")
    );
    const dialog = await openIdeaPanel();
    expect(await within(dialog).findByText("下書きの取得に失敗しました")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "再読み込み" }));
    const frame = await within(dialog).findByTitle("本番プレビュー");
    expect(frame).toHaveAttribute("data-preview-html", "<p>復活しました</p>");
  });

  it("success:false で error が無いときは既定メッセージ", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      { json: { success: false } }
    );
    const dialog = await openIdeaPanel();
    expect(await within(dialog).findByText("下書きの取得に失敗しました。")).toBeInTheDocument();
  });

  it("取得中はローディングを表示する", async () => {
    let release!: (v: unknown) => void;
    const pending = new Promise((r) => {
      release = r;
    });
    const fn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, items: [ideaItem({ contentId: "g-abc" })] })
      )
      .mockReturnValueOnce(pending);
    vi.stubGlobal("fetch", fn);

    const dialog = await openIdeaPanel();
    expect(await within(dialog).findByText("読み込み中…")).toBeInTheDocument();
    release(jsonResponse({ success: true, exists: false, draft: null }));
    expect(await within(dialog).findByText(/見つかりませんでした/)).toBeInTheDocument();
  });

  it("施策(proposal)では下書きプレビューを出さない", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByText("下書きプレビュー")).not.toBeInTheDocument();
  });
});

describe("ApproveClient 下書き手動編集(#77)", () => {
  async function openReadyDraft(bodyHtml: string, ...rest: Array<unknown>) {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml, body: "" },
        },
      },
      ...(rest as Parameters<typeof mockFetchSequence>)
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("button", { name: "下書きを編集" });
    return dialog;
  }

  // #104: 編集は全画面ワークスペース(別 dialog)で行う。エディタ/保存等はこちらに入る。
  const getWorkspace = () => screen.getByRole("dialog", { name: "記事を編集" });

  it("「編集」で全画面ワークスペースが開き、本文を読み込む", async () => {
    const dialog = await openReadyDraft("<p>元の本文</p>");
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを編集" }));
    const editor = within(getWorkspace()).getByLabelText("本文エディタ");
    expect(editor).toHaveValue("<p>元の本文</p>");
  });

  // 回帰(#136): 編集ワークスペースは詳細パネル(アニメ/sticky な祖先)の内側に
  // ネストすると position:fixed が祖先に閉じ込められ、全画面オーバーレイが崩れて
  // 背後の詳細パネルが透けて重なる。トップレベルに描画して fixed をビューポート基準にする。
  it("編集ワークスペースは詳細パネルの外(トップレベル)に描画される", async () => {
    const dialog = await openReadyDraft("<p>元の本文</p>");
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを編集" }));
    const detail = screen.getByRole("dialog", { name: "詳細: 猛暑記事" });
    expect(detail.contains(getWorkspace())).toBe(false);
  });

  it("編集中はライブ本番プレビュー(iframe)が入力に追従する(#98/#100)", async () => {
    const dialog = await openReadyDraft("<p>元の本文</p>");
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを編集" }));
    // #100/#104: プレビューは ワークスペース内の iframe。観測点 data-preview-html が追従する。
    const frame = within(getWorkspace()).getByTitle("本番ライブプレビュー");
    await waitFor(() =>
      expect(frame).toHaveAttribute("data-preview-html", "<p>元の本文</p>"),
    );
    const editor = within(getWorkspace()).getByLabelText("本文エディタ");
    await userEvent.clear(editor);
    await userEvent.type(editor, "ライブ反映テキスト");
    await waitFor(() =>
      expect(frame.getAttribute("data-preview-html")).toContain("ライブ反映テキスト"),
    );
  });

  it("編集して保存すると /draft/edit に送り、プレビューを更新する", async () => {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "<p>元</p>", body: "" },
        },
      },
      { json: { success: true } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "<p>保存後の本文</p>", body: "" },
        },
      }
    );
    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: "下書きを編集" }));

    const editor = within(getWorkspace()).getByLabelText("本文エディタ");
    await userEvent.clear(editor);
    await userEvent.type(editor, "編集しました");
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "保存" }));

    // 保存後に再取得したプレビュー(iframe)が出る
    const frame = await within(dialog).findByTitle("本番プレビュー");
    expect(frame).toHaveAttribute("data-preview-html", "<p>保存後の本文</p>");
    // 編集モード(ワークスペース)は閉じる
    expect(screen.queryByRole("dialog", { name: "記事を編集" })).not.toBeInTheDocument();
    const editPost = fn.mock.calls.find((c) => String(c[0]).includes("/api/growth/draft/edit"));
    expect(editPost).toBeTruthy();
    expect(JSON.parse((editPost![1] as RequestInit).body as string).pageId).toBe("i1");
  });

  it("保存失敗はエラーを表示し、編集モードを維持する", async () => {
    const dialog = await openReadyDraft(
      "<p>元</p>",
      { ok: false, status: 502, json: { success: false, error: "保存中にエラーが発生しました" } }
    );
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを編集" }));
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "保存" }));
    expect(await within(getWorkspace()).findByText("保存中にエラーが発生しました")).toBeInTheDocument();
    expect(within(getWorkspace()).getByLabelText("本文エディタ")).toBeInTheDocument();
  });

  it("error の無い保存失敗は既定メッセージ", async () => {
    const dialog = await openReadyDraft("<p>元</p>", { json: { success: false } });
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを編集" }));
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "保存" }));
    expect(await within(getWorkspace()).findByText("保存に失敗しました。")).toBeInTheDocument();
  });

  it("変更がなければキャンセルで即座に編集を終える", async () => {
    const dialog = await openReadyDraft("<p>元</p>");
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを編集" }));
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("dialog", { name: "記事を編集" })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "下書きを編集" })).toBeInTheDocument();
  });

  it("未保存の変更があるとキャンセルで破棄確認を出し、破棄/編集に戻るを選べる", async () => {
    const dialog = await openReadyDraft("<p>元</p>");
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを編集" }));
    await userEvent.type(within(getWorkspace()).getByLabelText("本文エディタ"), "変更");
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "キャンセル" }));
    expect(within(getWorkspace()).getByText(/破棄しますか/)).toBeInTheDocument();

    // 「編集に戻る」→ 確認が消えエディタは残る
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "編集に戻る" }));
    expect(within(getWorkspace()).queryByText(/破棄しますか/)).not.toBeInTheDocument();
    expect(within(getWorkspace()).getByLabelText("本文エディタ")).toBeInTheDocument();

    // 再度キャンセル→破棄する→編集終了
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "キャンセル" }));
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "破棄する" }));
    expect(screen.queryByRole("dialog", { name: "記事を編集" })).not.toBeInTheDocument();
  });

  it("保存中はボタンを無効化し『保存中…』を出す", async () => {
    let release!: (v: unknown) => void;
    const pending = new Promise((r) => {
      release = r;
    });
    const fn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ success: true, items: [ideaItem({ contentId: "g-abc" })] })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "<p>元</p>", body: "" },
        })
      )
      .mockReturnValueOnce(pending);
    vi.stubGlobal("fetch", fn);

    render(<ApproveClient />);
    await login();
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(await within(dialog).findByRole("button", { name: "下書きを編集" }));
    await userEvent.click(within(getWorkspace()).getByRole("button", { name: "保存" }));

    expect(await within(getWorkspace()).findByRole("button", { name: "保存中…" })).toBeDisabled();
    release(jsonResponse({ success: true }));
  });
});

describe("ApproveClient 生成中の可視化(#108)", () => {
  it("生成中カードは『自宅PCで執筆中…』と進捗ステップを出す", async () => {
    flags.authEnabled = false;
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ id: "i1", title: "執筆中記事", stage: "generating" })] },
    });
    render(<ApproveClient />);
    await screen.findByText("執筆中記事");
    expect(screen.getByText("🖊 自宅PCで執筆中…")).toBeInTheDocument();
    expect(screen.getByText(/取材 → 構成 → 推敲/)).toBeInTheDocument();
  });

  it("生成が完了(下書き作成済み)するとトーストを出し、閉じられる", async () => {
    flags.authEnabled = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockFetchSequence(
        { json: { success: true, items: [ideaItem({ id: "i1", title: "完成待ち", stage: "generating" })] } },
        {
          json: {
            success: true,
            items: [ideaItem({ id: "i1", title: "完成待ち", stage: "drafted", isDraftReady: true })],
          },
        }
      );
      render(<ApproveClient />);
      await screen.findByText("完成待ち");
      await vi.advanceTimersByTimeAsync(5100); // 1回ポーリング
      // トースト span は「🎉 …」を含むため部分一致で照合する。
      const toast = await screen.findByText(/「完成待ち」の下書きが完成しました/);
      expect(toast).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "通知を閉じる: 🎉 「完成待ち」の下書きが完成しました" })
      );
      expect(
        screen.queryByText("「完成待ち」の下書きが完成しました")
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ポーリングが連続失敗すると『最新化できていません』バナーを出し、再試行で消える(#H5)", async () => {
    flags.authEnabled = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockFetchSequence(
        { json: { success: true, items: [ideaItem({ id: "i1", title: "進行中", stage: "generating" })] } },
        new Error("down"), // poll 失敗1
        new Error("down"), // poll 失敗2(閾値2)
        {
          json: {
            success: true,
            items: [ideaItem({ id: "i1", title: "進行中", stage: "drafted", isDraftReady: true })],
          },
        } // 再試行 → 成功(以後 in-flight なしで停止)
      );
      render(<ApproveClient />);
      await screen.findByText("進行中");
      await vi.advanceTimersByTimeAsync(5100);
      await vi.advanceTimersByTimeAsync(5100);
      expect(await screen.findByText(/最新情報を取得できていません/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "再試行" }));
      await waitFor(() =>
        expect(screen.queryByText(/最新情報を取得できていません/)).not.toBeInTheDocument()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("生成中が長引くと滞留警告を出す", async () => {
    flags.authEnabled = false;
    // Date は実物のまま spy で制御し、タイマだけ偽装する(setSystemTime の catch-up を避ける)。
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"],
    });
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(0);
    try {
      mockFetchSequence(
        { json: { success: true, items: [ideaItem({ id: "i1", title: "長期記事", stage: "generating" })] } },
        { json: { success: true, items: [ideaItem({ id: "i1", title: "長期記事", stage: "generating" })] } }
      );
      render(<ApproveClient />);
      // マウント取得を flush(firstSeen=0 で記録される)。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByText("長期記事")).toBeInTheDocument();
      // 以降の Date.now を閾値超に。1回ポーリングで nowTick が更新され滞留判定が立つ。
      nowSpy.mockReturnValue(STUCK_THRESHOLD_MS + 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(screen.getByText(/時間がかかっています/)).toBeInTheDocument();
    } finally {
      nowSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("生成中の記事が継続したまま別の記事が増えても滞留基準を二重記録しない", async () => {
    flags.authEnabled = false;
    vi.useFakeTimers({
      toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout"],
    });
    try {
      mockFetchSequence(
        { json: { success: true, items: [ideaItem({ id: "i1", title: "継続中", stage: "generating" })] } },
        {
          json: {
            success: true,
            items: [
              ideaItem({ id: "i1", title: "継続中", stage: "generating" }),
              ideaItem({ id: "i2", title: "新着", stage: "generating" }),
            ],
          },
        }
      );
      render(<ApproveClient />);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(screen.getByText("継続中")).toBeInTheDocument();
      // poll で i2 が増えて盤の参照が変わり firstSeen 効果が再実行されるが、
      // 既に在中の i1 は seen 済みで再記録しない(滞留基準=最初に在中した時刻を保つ)。
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5100);
      });
      expect(screen.getByText("新着")).toBeInTheDocument();
      expect(screen.getByText("継続中")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ポーリングの取得失敗は握りつぶし、盤は前回値を保つ", async () => {
    flags.authEnabled = false;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mockFetchSequence(
        { json: { success: true, items: [ideaItem({ id: "i1", title: "継続記事", stage: "generating" })] } },
        { ok: false, status: 500, json: { success: false, error: "一時エラー" } }
      );
      render(<ApproveClient />);
      await screen.findByText("継続記事");
      await vi.advanceTimersByTimeAsync(5100); // poll 失敗
      // 盤は前回値を保ち、トーストは出ない。
      expect(screen.getByText("継続記事")).toBeInTheDocument();
      expect(screen.queryByText(/下書きが完成しました/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ApproveClient 操作性(#109)", () => {
  it("表示密度トグルが効き、localStorage に保存される", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    const toggle = screen.getByRole("button", { name: "標準" });
    await userEvent.click(toggle);
    expect(screen.getByRole("button", { name: "コンパクト" })).toBeInTheDocument();
    expect(window.localStorage.getItem("growth-approve-density")).toBe("compact");
  });

  it("密度は localStorage から復元する", async () => {
    flags.authEnabled = false;
    window.localStorage.setItem("growth-approve-density", "compact");
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    expect(screen.getByRole("button", { name: "コンパクト" })).toBeInTheDocument();
    window.localStorage.clear();
  });

  it("キーボード j で先頭にフォーカスし a で承認する", async () => {
    flags.authEnabled = false;
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    fireEvent.keyDown(document.body, { key: "j" }); // 先頭へフォーカス
    fireEvent.keyDown(document.body, { key: "a" }); // 承認
    expect(await screen.findByText("承認しました")).toBeInTheDocument();
  });

  it("キーボード r で却下、e で詳細、Esc でパレットを閉じる", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    // e: フォーカス先頭→詳細を開く
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "e" });
    expect(await screen.findByRole("dialog", { name: "詳細: 市川ページ" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "Escape" });
  });

  it("/ でコマンドパレットが開き、検索してジャンプできる", async () => {
    flags.authEnabled = false;
    mockFetchSequence({
      json: { success: true, items: [proposalItem(), ideaItem({ title: "猛暑記事" })] },
    });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    fireEvent.keyDown(document.body, { key: "/" });
    const palette = await screen.findByRole("dialog", { name: "コマンドパレット" });
    await userEvent.type(within(palette).getByLabelText("コマンド検索"), "猛暑");
    await userEvent.click(within(palette).getByRole("button", { name: /猛暑記事/ }));
    expect(await screen.findByRole("dialog", { name: "詳細: 猛暑記事" })).toBeInTheDocument();
  });

  it("ツールバーの検索ボタンで開き、背景クリックで閉じられる(キーボード非依存)", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("button", { name: /検索・ジャンプ/ }));
    expect(await screen.findByRole("dialog", { name: "コマンドパレット" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "コマンドパレットを閉じる" }));
    expect(screen.queryByRole("dialog", { name: "コマンドパレット" })).not.toBeInTheDocument();
  });

  it("一括選択して一括承認できる", async () => {
    flags.authEnabled = false;
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [proposalItem(), proposalItem({ id: "p2", title: "他施策" })],
        },
      },
      { json: { success: true, updated: 1 } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("checkbox", { name: "一括選択: 市川ページ" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "一括選択: 他施策" }));
    expect(screen.getByText("2件 選択中")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "一括承認" }));
    expect(await screen.findAllByText("承認しました")).toHaveLength(2);
  });

  it("一括選択を『解除』ボタンでクリアできる", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("checkbox", { name: "一括選択: 市川ページ" }));
    expect(screen.getByText("1件 選択中")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "解除" }));
    expect(screen.queryByText(/件 選択中/)).not.toBeInTheDocument();
  });

  it("一括却下もできる", async () => {
    flags.authEnabled = false;
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    await userEvent.click(screen.getByRole("checkbox", { name: "一括選択: 市川ページ" }));
    await userEvent.click(screen.getByRole("button", { name: "一括却下" }));
    expect(await screen.findByText("却下しました")).toBeInTheDocument();
  });

  it("キーボード r で却下する", async () => {
    flags.authEnabled = false;
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "r" });
    expect(await screen.findByText("却下しました")).toBeInTheDocument();
  });

  it("フォーカスが無いと a / e は何もしない", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    fireEvent.keyDown(document.body, { key: "a" }); // フォーカス無し
    fireEvent.keyDown(document.body, { key: "e" }); // フォーカス無し
    expect(screen.queryByText("承認しました")).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "詳細: 市川ページ" })).not.toBeInTheDocument();
  });

  it("決定済みのカードはキー操作の承認対象にならない", async () => {
    flags.authEnabled = false;
    mockFetchSequence(
      { json: { success: true, items: [proposalItem()] } },
      { json: { success: true, updated: 1 } }
    );
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    // まず承認(決定済みに)。
    fireEvent.keyDown(document.body, { key: "j" });
    fireEvent.keyDown(document.body, { key: "a" });
    await screen.findByText("承認しました");
    // もう一度 a を押しても二重決定しない(isBulkActionable=false)。
    fireEvent.keyDown(document.body, { key: "a" });
    expect(screen.getAllByText("承認しました")).toHaveLength(1);
  });

  it("未対応キーは無視する", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    fireEvent.keyDown(document.body, { key: "x" }); // 未対応
    expect(screen.queryByText("承認しました")).not.toBeInTheDocument();
  });

  it("入力欄にフォーカス中の単一キーは抑止する", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    const checkbox = screen.getByRole("checkbox", { name: "一括選択: 市川ページ" });
    fireEvent.keyDown(checkbox, { key: "a" }); // input 上の a は抑止
    expect(screen.queryByText("承認しました")).not.toBeInTheDocument();
  });

  it("フォーカス無しの r は何もしない(document 直送)", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    fireEvent.keyDown(document, { key: "r" }); // target=document(tagName無)・フォーカス無し
    expect(screen.queryByText("却下しました")).not.toBeInTheDocument();
  });

  it("k で上方向、⌘K でパレットを開ける", async () => {
    flags.authEnabled = false;
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await screen.findByText("市川ページ");
    fireEvent.keyDown(document.body, { key: "k" }); // prev(先頭で頭打ち)
    fireEvent.keyDown(document.body, { key: "k", metaKey: true }); // パレット
    expect(await screen.findByRole("dialog", { name: "コマンドパレット" })).toBeInTheDocument();
  });
});

describe("ApproveClient 盤→編集ワークスペース統合(#110)", () => {
  const draftReady110 = (bodyHtml: string) => ({
    json: {
      success: true,
      exists: true,
      draft: { title: "T", displayMode: "html", bodyHtml, body: "" },
    },
  });

  it("盤の下書きカードの『編集』から全画面ワークスペースが直接開く", async () => {
    flags.authEnabled = false;
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [ideaItem({ id: "i1", title: "下書きA", stage: "drafted", isDraftReady: true, contentId: "g-1" })],
        },
      },
      draftReady110("<p>本文A</p>")
    );
    render(<ApproveClient />);
    await screen.findByText("下書きA");
    await userEvent.click(screen.getByRole("button", { name: "編集: 下書きA" }));
    // 下書き取得後にワークスペース(別dialog)が自動で開く。
    const ws = await screen.findByRole("dialog", { name: "記事を編集" });
    expect(within(ws).getByLabelText("本文エディタ")).toHaveValue("<p>本文A</p>");
  });

  it("編集→保存でワークスペースが閉じ、プレビューが最新化する", async () => {
    flags.authEnabled = false;
    mockFetchSequence(
      {
        json: {
          success: true,
          items: [ideaItem({ id: "i1", title: "下書きA", stage: "drafted", isDraftReady: true, contentId: "g-1" })],
        },
      },
      draftReady110("<p>元</p>"),
      { json: { success: true } },
      draftReady110("<p>保存後</p>")
    );
    render(<ApproveClient />);
    await screen.findByText("下書きA");
    await userEvent.click(screen.getByRole("button", { name: "編集: 下書きA" }));
    const ws = await screen.findByRole("dialog", { name: "記事を編集" });
    await userEvent.click(within(ws).getByRole("button", { name: "保存" }));
    // ワークスペースが閉じ、ドロワーのプレビュー(iframe)が最新化。
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "記事を編集" })).not.toBeInTheDocument()
    );
    const frame = await screen.findByTitle("本番プレビュー");
    expect(frame).toHaveAttribute("data-preview-html", "<p>保存後</p>");
  });

  it("取得前にドロワーを閉じると保留が破棄され、ワークスペースは開かない", async () => {
    flags.authEnabled = false;
    let release!: (v: unknown) => void;
    const pending = new Promise((r) => { release = r; });
    const fn = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          items: [ideaItem({ id: "i1", title: "下書きA", stage: "drafted", isDraftReady: true, contentId: "g-1" })],
        })
      )
      .mockReturnValueOnce(pending); // 下書き取得は保留のまま
    vi.stubGlobal("fetch", fn);

    render(<ApproveClient />);
    await screen.findByText("下書きA");
    await userEvent.click(screen.getByRole("button", { name: "編集: 下書きA" }));
    // 取得中にドロワーを閉じる。
    await userEvent.click(await screen.findByRole("button", { name: "オーバーレイを閉じる" }));
    release(jsonResponse(draftReady110("<p>A</p>").json));
    // ワークスペースは開かない。
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "記事を編集" })).not.toBeInTheDocument()
    );
  });
});

describe("ApproveClient タブ分離/ルーティング(#119)", () => {
  function mockMixed() {
    return mockFetchSequence({
      json: {
        success: true,
        items: [
          proposalItem({ id: "p1", title: "施策X" }),
          ideaItem({ id: "i1", title: "記事Y", stage: "proposed" }),
        ],
      },
    });
  }

  it("施策/記事タブを表示し、未処理件数バッジを出す", async () => {
    mockMixed();
    render(<ApproveClient />);
    await login();
    await screen.findByText("施策X");
    // 未処理がある施策が既定タブ
    expect(screen.getByRole("tab", { name: /施策/ })).toHaveAttribute("aria-selected", "true");
    const propTab = screen.getByRole("tab", { name: /施策/ });
    expect(within(propTab).getByText("1")).toBeInTheDocument(); // 施策の未処理1件バッジ
    // 既定では記事パイプラインは出ない
    expect(screen.queryByRole("region", { name: "記事パイプライン" })).not.toBeInTheDocument();
  });

  it("タブ切替で記事タブへ移り、URL に ?view=articles を書く", async () => {
    mockMixed();
    render(<ApproveClient />);
    await login();
    await screen.findByText("施策X");
    await selectTab(/記事/);
    expect(screen.getByText("記事Y")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "記事パイプライン" })).toBeInTheDocument();
    expect(window.location.search).toContain("view=articles");
  });

  it("URL に ?view=articles があれば記事タブを初期表示する", async () => {
    window.history.replaceState(null, "", "/?view=articles");
    mockMixed();
    render(<ApproveClient />);
    await login();
    // 未処理は施策側だが、URL 指定で記事タブが開く
    expect(await screen.findByText("記事Y")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /記事/ })).toHaveAttribute("aria-selected", "true");
  });

  it("パレットから施策へジャンプすると施策タブへ自動切替して詳細を開く", async () => {
    window.history.replaceState(null, "", "/?view=articles");
    mockMixed();
    render(<ApproveClient />);
    await login();
    await screen.findByText("記事Y"); // 記事タブから開始
    fireEvent.keyDown(document.body, { key: "/" });
    const palette = await screen.findByRole("dialog", { name: "コマンドパレット" });
    await userEvent.type(within(palette).getByLabelText("コマンド検索"), "施策X");
    await userEvent.click(within(palette).getByRole("button", { name: /施策X/ }));
    expect(await screen.findByRole("dialog", { name: "詳細: 施策X" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /施策/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("ApproveClient タブ初期化の同期(#119)", () => {
  it("URL=記事タブの初回描画で生成中カードを表示する(滞留基準が未記録の経路)", async () => {
    window.history.replaceState(null, "", "/?view=articles");
    mockFetchSequence({
      json: {
        success: true,
        items: [ideaItem({ id: "g1", title: "生成中の記事", stage: "generating", isDraftReady: false })],
      },
    });
    render(<ApproveClient />);
    await login();
    // 初回描画時点では firstSeen 未記録 → 滞留扱いにならず通常表示される。
    expect(await screen.findByText("生成中の記事")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /記事/ })).toHaveAttribute("aria-selected", "true");
  });
});

describe("ApproveClient タブのキーボード/a11y(#119)", () => {
  function mockMixed2() {
    return mockFetchSequence({
      json: {
        success: true,
        items: [
          proposalItem({ id: "p1", title: "施策X" }),
          ideaItem({ id: "i1", title: "記事Y", stage: "proposed" }),
        ],
      },
    });
  }

  it("← → でタブを移動でき、その他キーは無視する", async () => {
    mockMixed2();
    render(<ApproveClient />);
    await login();
    await screen.findByText("施策X");
    const tablist = screen.getByRole("tablist", { name: "表示切替" });

    // 既定は施策。→ で記事へ。
    fireEvent.keyDown(tablist, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: /記事/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("記事Y")).toBeInTheDocument();

    // ← で施策へ戻る。
    fireEvent.keyDown(tablist, { key: "ArrowLeft" });
    expect(screen.getByRole("tab", { name: /施策/ })).toHaveAttribute("aria-selected", "true");

    // 対象外キーは何もしない(施策のまま)。
    fireEvent.keyDown(tablist, { key: "Enter" });
    expect(screen.getByRole("tab", { name: /施策/ })).toHaveAttribute("aria-selected", "true");
  });

  it("tab と tabpanel が aria-controls/labelledby で紐付く", async () => {
    mockMixed2();
    render(<ApproveClient />);
    await login();
    await screen.findByText("施策X");
    const panel = screen.getByRole("tabpanel");
    expect(panel).toHaveAttribute("id", "approve-tabpanel");
    expect(panel).toHaveAttribute("aria-labelledby", "approve-tab-proposals");
    const propTab = screen.getByRole("tab", { name: /施策/ });
    expect(propTab).toHaveAttribute("aria-controls", "approve-tabpanel");
  });
});

describe("ApproveClient カードのタイトル視認性(#119 follow-up)", () => {
  const LONG = "とても長い記事タイトルがここに入って盤の狭い列でも全文を読みたい";

  async function titleOf(over: Record<string, unknown>) {
    mockFetchSequence({ json: { success: true, items: [ideaItem({ title: LONG, ...over })] } });
    render(<ApproveClient />);
    await login();
    return screen.findByText(LONG);
  }

  it("未処理カードのタイトルは2行クランプで主役表示する(truncateしない)", async () => {
    const title = await titleOf({ stage: "proposed" });
    expect(title).toHaveClass("line-clamp-2");
    expect(title).not.toHaveClass("truncate");
  });

  it("下書きカードのタイトルも2行クランプで表示する", async () => {
    const title = await titleOf({ stage: "drafted", isDraftReady: true, contentId: "g-1" });
    expect(title).toHaveClass("line-clamp-2");
    expect(title).not.toHaveClass("truncate");
  });

  it("生成待ち/生成中カードのタイトルも2行クランプで表示する", async () => {
    const title = await titleOf({ stage: "generating" });
    expect(title).toHaveClass("line-clamp-2");
  });
});

describe("ApproveClient 詳細パネルのレイアウト(#127)", () => {
  it("記事の詳細は全画面の中央モーダル(95vw×94vh)＋プレビューは中央ゾーン追従", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    expect(dialog).toHaveClass("w-[95vw]");
    expect(dialog).toHaveClass("h-[94vh]");
    // 本番プレビューは中央ゾーン(sticky 追従)に配置される。
    const preview = within(dialog).getByRole("region", { name: "下書きプレビュー" });
    expect(preview.parentElement).toHaveClass("lg:sticky");
  });

  it("施策の詳細はモーダル化せずコンパクトな右ドロワーのまま", async () => {
    mockFetchSequence({ json: { success: true, items: [proposalItem()] } });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 市川ページ" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 市川ページ" });
    expect(dialog).not.toHaveClass("w-[95vw]");
    expect(dialog).toHaveClass("max-w-md");
  });
});

describe("ApproveClient 詳細パネルのリッチ化(#124)", () => {
  it("ヘッダーに段階チップ＋種別、根拠はメトリクスチップで出る", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    // 段階チップ(提案中)＋種別バッジ
    expect(within(dialog).getByText("提案中")).toBeInTheDocument();
    expect(within(dialog).getByText("📝 記事")).toBeInTheDocument();
    // 根拠(details)はメトリクスチップ(ラベル＋値)
    expect(within(dialog).getByText("優先度")).toBeInTheDocument();
    expect(within(dialog).getByText("中")).toBeInTheDocument();
  });

  it("承認済みの記事はヘッダー段階が『生成待ち』へ前進する", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem()] } },
      { json: { success: true, updated: 1 } },
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    await userEvent.click(within(dialog).getByRole("button", { name: "承認" }));
    // パネルは閉じるので、盤側の段階前進は別テスト。ここではヘッダーの楽観反映を
    // 開き直して確認する。
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const reopened = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    expect(within(reopened).getByText("生成待ち")).toBeInTheDocument();
  });
});

describe("ApproveClient レビューワークスペース土台(#127)", () => {
  async function openIdeaWithDraft(body: string) {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "<p>本文</p>", body },
        },
      },
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    return screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
  }

  it("「なぜこの記事か」カードに根拠(subtitle)を出す", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem({ subtitle: "SEO機会あり" })] } });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    expect(within(dialog).getByText("なぜこの記事か")).toBeInTheDocument();
    expect(within(dialog).getByText("SEO機会あり")).toBeInTheDocument();
  });

  it("本文コピーでクリップボードに body を書き込む", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const dialog = await openIdeaWithDraft("コピー対象の本文");
    await userEvent.click(await within(dialog).findByRole("button", { name: "本文をコピー" }));
    expect(writeText).toHaveBeenCalledWith("コピー対象の本文");
    // M8: 成功トーストを出す(沈黙させない)。
    expect(await screen.findByText("本文をコピーしました。")).toBeInTheDocument();
  });

  it("コピーが拒否(reject)されても握り込んで壊れない", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const dialog = await openIdeaWithDraft("本文");
    await userEvent.click(await within(dialog).findByRole("button", { name: "本文をコピー" }));
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByText("コピーに失敗しました。")).toBeInTheDocument();
  });

  it("クリップボード非対応でもコピーで壊れない", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const dialog = await openIdeaWithDraft("本文");
    await userEvent.click(await within(dialog).findByRole("button", { name: "本文をコピー" }));
    // 例外で落ちずパネルは開いたまま。
    expect(dialog).toBeInTheDocument();
    expect(await screen.findByText("このブラウザではコピーできません。")).toBeInTheDocument();
  });

  it("下書きプレビューにアイキャッチ差し替え導線(#143)を出す", async () => {
    const dialog = await openIdeaWithDraft("本文");
    expect(
      await within(dialog).findByRole("button", { name: "アイキャッチを差し替え" }),
    ).toBeInTheDocument();
  });

  it("差し替え→反映で下書きを再取得する(#143 結線)", async () => {
    const asset = "https://images.microcms-assets.io/a/1.png";
    const draft = { title: "T", displayMode: "html", bodyHtml: "<p>本文</p>", body: "x" };
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      { json: { success: true, exists: true, draft } },
      { json: { success: true, media: [{ url: asset }] } }, // メディア一覧
      { json: { success: true } }, // eyecatch 差し替え
      { json: { success: true, exists: true, draft: { ...draft, eyecatch: asset } } }, // 再取得
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });

    await userEvent.click(await within(dialog).findByRole("button", { name: "アイキャッチを差し替え" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "アイキャッチに設定 1" }));

    // onReplaced → loadDraft 再取得(/api/growth/draft? が2回呼ばれる)
    await waitFor(() => {
      const draftCalls = fn.mock.calls.filter((c) => String(c[0]).includes("/api/growth/draft?"));
      expect(draftCalls.length).toBe(2);
    });
  });

  it("本文画像があれば差し替えパネルを出し、保存で下書きを再取得する(#145 結線)", async () => {
    const img = "https://images.microcms-assets.io/a/1.png";
    const media = "https://images.microcms-assets.io/c/new.png";
    const draft = {
      title: "T",
      displayMode: "html",
      bodyHtml: `<figure><img src="${img}" alt="図1"></figure>`,
      body: "x",
    };
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      { json: { success: true, exists: true, draft } },
      { json: { success: true, media: [{ url: media }] } }, // メディア一覧
      { json: { success: true } }, // draft/edit 保存
      { json: { success: true, exists: true, draft } }, // 再取得
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });

    await userEvent.click(await within(dialog).findByRole("button", { name: "本文画像1を差し替え" }));
    await userEvent.click(await within(dialog).findByRole("button", { name: "この画像に差し替え 1" }));

    await waitFor(() => {
      const draftCalls = fn.mock.calls.filter((c) => String(c[0]).includes("/api/growth/draft?"));
      expect(draftCalls.length).toBe(2);
    });
  });

  it("スタイリング・アドバイスを依頼すると下書きを再取得する(#146 結線)", async () => {
    const draft = { title: "T", displayMode: "html", bodyHtml: "<p>本文</p>", body: "x" };
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      { json: { success: true, exists: true, draft } },
      { json: { success: true } }, // advise 依頼
      { json: { success: true, exists: true, draft } }, // 再取得
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    const drawer = await openConsultDrawer(dialog);

    // 下書きが揃う段階(draft)では既定で「全体を見てもらう」タブ→「相談する」で advise 依頼。
    await userEvent.click(await within(drawer).findByRole("button", { name: "相談する" }));

    // onChanged → loadDraft 再取得(/api/growth/draft? が2回)
    await waitFor(() => {
      const draftCalls = fn.mock.calls.filter((c) => String(c[0]).includes("/api/growth/draft?"));
      expect(draftCalls.length).toBe(2);
    });
    expect(fn.mock.calls.some((c) => String(c[0]).includes("/api/growth/advise"))).toBe(true);
  });

  it("装飾を提案すると下書きを再取得する(#147 結線)", async () => {
    const draft = { title: "T", displayMode: "html", bodyHtml: "<p>本文</p>", body: "x" };
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      { json: { success: true, exists: true, draft } },
      { json: { success: true } }, // decorate 依頼
      { json: { success: true, exists: true, draft } }, // 再取得
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });

    await userEvent.click(await within(dialog).findByRole("button", { name: "装飾を提案" }));

    await waitFor(() => {
      const draftCalls = fn.mock.calls.filter((c) => String(c[0]).includes("/api/growth/draft?"));
      expect(draftCalls.length).toBe(2);
    });
    expect(fn.mock.calls.some((c) => String(c[0]).includes("/api/growth/decorate"))).toBe(true);
  });

  it("Esc で詳細パネルを閉じる", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "詳細: 猛暑記事" })).not.toBeInTheDocument()
    );
  });

  it("下書き編集中は Esc で閉じない(編集を優先)", async () => {
    const dialog = await openIdeaWithDraft("本文");
    await userEvent.click(within(dialog).getByRole("button", { name: "下書きを編集" }));
    await screen.findByRole("dialog", { name: "記事を編集" }); // 編集ワークスペース
    fireEvent.keyDown(document.body, { key: "Escape" });
    // 詳細パネルは残る。
    expect(screen.getByRole("dialog", { name: "詳細: 猛暑記事" })).toBeInTheDocument();
  });

  it("入力欄(タイトル編集)にフォーカス中の Esc では閉じない", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ outline: "## 見出しA" })] },
    });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    // タイトル直接編集の入力欄(詳細パネルに残る手動編集)を開く。
    await userEvent.click(within(dialog).getByRole("button", { name: "タイトルを編集: 猛暑記事" }));
    const input = within(dialog).getByLabelText("タイトルを編集");
    // input にフォーカスがある状態の Esc はパネルを閉じない(入力中断のみ)。
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "詳細: 猛暑記事" })).toBeInTheDocument();
  });
});

describe("ApproveClient 公開前チェックリスト(#128)", () => {
  it("下書き取得済みのパネルに公開前チェックを出す", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: {
            title: "T",
            displayMode: "html",
            bodyHtml: "<h2>A</h2><p>本文</p>",
            body: "本文テキスト",
          },
        },
      },
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    const checklist = await within(dialog).findByRole("region", { name: "公開前チェック" });
    expect(within(checklist).getByText("文字数")).toBeInTheDocument();
    expect(within(checklist).getByText("見出し")).toBeInTheDocument();
    expect(within(checklist).getByText("画像")).toBeInTheDocument();
  });

  it("下書き未生成の記事ではチェックリストを出さない", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    expect(within(dialog).queryByRole("region", { name: "公開前チェック" })).not.toBeInTheDocument();
  });
});

describe("ApproveClient プレビューPC/モバイル切替(#129)", () => {
  async function openReadyPreview() {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "<p>本文</p>", body: "x" },
        },
      },
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    return screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
  }

  it("モバイルに切替えるとプレビュー枠が〜390pxに、PCで全幅に戻る", async () => {
    const dialog = await openReadyPreview();
    const group = await within(dialog).findByRole("group", { name: "プレビュー幅" });
    // 既定は PC(全幅)。
    const frame = within(dialog).getByTitle("本番プレビュー").parentElement as HTMLElement;
    expect(frame).not.toHaveClass("max-w-[390px]");
    // モバイルへ。
    await userEvent.click(within(group).getByRole("button", { name: "モバイル" }));
    expect(frame).toHaveClass("max-w-[390px]");
    expect(within(group).getByRole("button", { name: "モバイル" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // PC へ戻す。
    await userEvent.click(within(group).getByRole("button", { name: "PC" }));
    expect(frame).not.toHaveClass("max-w-[390px]");
  });
});

describe("ApproveClient 連続レビュー＋キーボード(#130)", () => {
  function mockTwoIdeas() {
    return mockFetchSequence(
      {
        json: {
          success: true,
          items: [
            ideaItem({ id: "i1", title: "記事1", score: 9 }),
            ideaItem({ id: "i2", title: "記事2", score: 1 }),
          ],
        },
      },
      { json: { success: true, updated: 1 } }, // 承認/却下 POST 用(消費されないテストもある)
    );
  }
  async function openFirst() {
    mockTwoIdeas();
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 記事1" }));
    return screen.findByRole("dialog", { name: "詳細: 記事1" });
  }

  it("「次へ」で閉じずに次の未処理記事へ移動、末尾では無効", async () => {
    const dialog = await openFirst();
    await userEvent.click(within(dialog).getByRole("button", { name: "次へ →" }));
    expect(await screen.findByRole("dialog", { name: "詳細: 記事2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "次へ →" })).toBeDisabled();
  });

  it("キーボード j/k でレビュー対象を移動", async () => {
    await openFirst();
    fireEvent.keyDown(document.body, { key: "j" });
    expect(await screen.findByRole("dialog", { name: "詳細: 記事2" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "k" });
    expect(await screen.findByRole("dialog", { name: "詳細: 記事1" })).toBeInTheDocument();
  });

  it("先頭で k・末尾で j は何もしない", async () => {
    await openFirst(); // 記事1=先頭
    fireEvent.keyDown(document.body, { key: "k" });
    expect(screen.getByRole("dialog", { name: "詳細: 記事1" })).toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "j" });
    await screen.findByRole("dialog", { name: "詳細: 記事2" }); // 末尾
    fireEvent.keyDown(document.body, { key: "j" });
    expect(screen.getByRole("dialog", { name: "詳細: 記事2" })).toBeInTheDocument();
  });

  it("キーボード a で開いている記事を承認する(段階が生成待ちへ)", async () => {
    const dialog = await openFirst();
    fireEvent.keyDown(document.body, { key: "a" });
    expect(await within(dialog).findByText("生成待ち")).toBeInTheDocument();
  });

  it("キーボード r で開いている記事を却下する", async () => {
    const dialog = await openFirst();
    fireEvent.keyDown(document.body, { key: "r" });
    expect(
      await within(dialog).findByRole("button", { name: "承認待ちに戻す" }),
    ).toBeInTheDocument();
  });

  it("未処理でない記事(生成待ち)では a/r は無効", async () => {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ id: "i1", title: "生成待ち記事", stage: "queued" })] },
    });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 生成待ち記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 生成待ち記事" });
    fireEvent.keyDown(document.body, { key: "a" });
    fireEvent.keyDown(document.body, { key: "r" });
    expect(within(dialog).getByText("生成待ち")).toBeInTheDocument();
  });

  it("キーボード e で下書きがあれば編集ワークスペースを開く", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "<p>本文</p>", body: "x" },
        },
      },
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    await within(dialog).findByRole("button", { name: "本文をコピー" }); // draft ready の目印
    fireEvent.keyDown(document.body, { key: "e" });
    expect(await screen.findByRole("dialog", { name: "記事を編集" })).toBeInTheDocument();
  });

  it("下書きが無い記事では e は何もしない", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    fireEvent.keyDown(document.body, { key: "e" });
    expect(screen.queryByRole("dialog", { name: "記事を編集" })).not.toBeInTheDocument();
  });
});

describe("ApproveClient スマホ操作性(#137)", () => {
  it("カードのタイトルをタップすると詳細が開く", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "猛暑記事" }));
    expect(
      await screen.findByRole("dialog", { name: "詳細: 猛暑記事" }),
    ).toBeInTheDocument();
  });

  it("キーボードヒントはデスクトップ限定で、モバイルにはタッチ向け案内を出す", async () => {
    mockFetchSequence({ json: { success: true, items: [ideaItem()] } });
    render(<ApproveClient />);
    await login();
    await screen.findByRole("button", { name: "猛暑記事" });
    const kbd = screen.getByText(/キーボード:/);
    expect(kbd).toHaveClass("hidden");
    expect(kbd).toHaveClass("lg:block");
    expect(screen.getByText(/カードをタップ/)).toBeInTheDocument();
  });
});

describe("ApproveClient アイキャッチ表示(#141)", () => {
  it("下書きにアイキャッチがあればプレビューに画像を表示する", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: {
            title: "T",
            displayMode: "html",
            bodyHtml: "<p>本文</p>",
            body: "",
            eyecatch: "https://images.microcms-assets.io/x.png",
          },
        },
      },
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByAltText(/アイキャッチ/)).toBeInTheDocument();
  });

  it("アイキャッチが無ければ画像は出さない", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "<p>本文</p>", body: "", eyecatch: "" },
        },
      },
    );
    render(<ApproveClient />);
    await login();
    await userEvent.click(await screen.findByRole("button", { name: "詳細: 猛暑記事" }));
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByRole("button", { name: "本文をコピー" });
    expect(within(dialog).queryByAltText(/アイキャッチ/)).not.toBeInTheDocument();
  });
});

describe("ApproveClient AI再生成の依頼中表示+ポーリング(#166)", () => {
  const IMG = "https://images.microcms-assets.io/assets/a/1.png";

  // 本文画像/アイキャッチ再生成のステータス付き下書きを組み立てる。
  function draftWithRegen(over: {
    bodyRegen?: { status: string; targetSrc: string };
    eyecatchRegen?: { status: string };
    bodyHtml?: string;
  }) {
    return {
      success: true,
      exists: true,
      draft: {
        title: "T",
        displayMode: "html",
        bodyHtml: over.bodyHtml ?? `<figure><img src="${IMG}" alt="図"></figure>`,
        body: "",
        bodyRegen: over.bodyRegen ?? { status: "なし", targetSrc: "" },
        eyecatchRegen: over.eyecatchRegen ?? { status: "なし" },
      },
    };
  }

  async function openWithDraft(busyDraft: unknown, pollResponse: unknown) {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc" })] } },
      { json: busyDraft },
      pollResponse as never
    );
    flags.authEnabled = false; // 自動取得(ログイン不要)
    render(<ApproveClient />);
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
  }

  it("本文画像が処理中の間はポーリングし、完了でバッジが消える", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await openWithDraft(
        draftWithRegen({ bodyRegen: { status: "処理中", targetSrc: IMG } }),
        { json: draftWithRegen({ bodyRegen: { status: "なし", targetSrc: "" } }) }
      );
      expect(await screen.findByText(/AI再生成 処理中/)).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(5100);
      await waitFor(() =>
        expect(screen.queryByText(/AI再生成 処理中/)).not.toBeInTheDocument()
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("アイキャッチが依頼中: success:false のポーリングは表示を維持する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await openWithDraft(draftWithRegen({ eyecatchRegen: { status: "依頼中" } }), {
        json: { success: false },
      });
      expect(await screen.findByText(/AI再生成 依頼中/)).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(5100);
      expect(screen.getByText(/AI再生成 依頼中/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ポーリングの !res.ok は表示を維持する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await openWithDraft(draftWithRegen({ eyecatchRegen: { status: "処理中" } }), {
        ok: false,
        status: 502,
        json: { success: false },
      });
      expect(await screen.findByText(/AI再生成 処理中/)).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(5100);
      expect(screen.getByText(/AI再生成 処理中/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ポーリングの exists:false は表示を維持する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await openWithDraft(draftWithRegen({ eyecatchRegen: { status: "処理中" } }), {
        json: { success: true, exists: false, draft: null },
      });
      expect(await screen.findByText(/AI再生成 処理中/)).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(5100);
      expect(screen.getByText(/AI再生成 処理中/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("ポーリングの一時障害(reject)は握りつぶして表示を維持する", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      await openWithDraft(
        draftWithRegen({ eyecatchRegen: { status: "処理中" } }),
        new Error("network")
      );
      expect(await screen.findByText(/AI再生成 処理中/)).toBeInTheDocument();
      await vi.advanceTimersByTimeAsync(5100);
      expect(screen.getByText(/AI再生成 処理中/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("ApproveClient 公開・クローズ(#167)", () => {
  // #H4: 公開前チェックが全て緑になる妥当な下書き(免責文あり・断定なし・十分な分量/見出し/画像/内部リンク)。
  const VALID_DRAFT_HTML =
    "<h2>見出し1</h2><h2>見出し2</h2>" +
    "<figure><img src='x' alt='図'></figure>" +
    '<a href="/ja/news/a">関連記事</a>' +
    `<p>${"あ".repeat(1500)}</p>` +
    "<p>※この記事はAIが作成した下書きです。公開前に内容をご確認ください。</p>";
  const DRAFT = {
    json: {
      success: true,
      exists: true,
      draft: {
        title: "T",
        displayMode: "html",
        bodyHtml: VALID_DRAFT_HTML,
        body: "",
        knownNewsPaths: ["/ja/news/a"],
      },
    },
  };

  async function openPanel(stage: string, ...after: Array<{ json?: unknown; ok?: boolean; status?: number }>) {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc", stage })] } },
      DRAFT,
      ...after
    );
    flags.authEnabled = false;
    render(<ApproveClient />);
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    await screen.findByRole("dialog");
    return fn;
  }

  async function confirmDialogButton(name: string): Promise<HTMLElement> {
    const cd = await screen.findByRole("dialog", { name: "公開・クローズの確認" });
    return within(cd).getByRole("button", { name });
  }

  it("下書き段階: 公開ボタンを出し、確認ダイアログ確定で /api/growth/publish に POST する", async () => {
    const fn = await openPanel(
      "drafted",
      { json: { success: true } }, // publish
      { json: { success: true, items: [ideaItem({ contentId: "g-abc", stage: "published" })] } } // pollBoard
    );
    await userEvent.click(screen.getByRole("button", { name: "公開する" }));
    await userEvent.click(await confirmDialogButton("公開を確定"));
    await waitFor(() =>
      expect(fn.mock.calls.some((c) => String(c[0]).includes("/api/growth/publish"))).toBe(true)
    );
    const call = fn.mock.calls.find((c) => String(c[0]).includes("/api/growth/publish"))!;
    expect(JSON.parse(call[1].body).pageId).toBe("i1");
    // H2: 公開成功でトーストを出す。
    expect(await screen.findByText("記事を公開しました。")).toBeInTheDocument();
  });

  it("公開: 確認ダイアログをキャンセルすると POST しない", async () => {
    const fn = await openPanel("drafted");
    await userEvent.click(screen.getByRole("button", { name: "公開する" }));
    await userEvent.click(await confirmDialogButton("キャンセル"));
    expect(fn.mock.calls.some((c) => String(c[0]).includes("/api/growth/publish"))).toBe(false);
  });

  it("公開前チェックに赤(§5免責欠落)があると公開ボタンを無効化し赤ヒントを出す(#H4)", async () => {
    mockFetchSequence(
      { json: { success: true, items: [ideaItem({ contentId: "g-abc", stage: "drafted" })] } },
      {
        json: {
          success: true,
          exists: true,
          draft: { title: "T", displayMode: "html", bodyHtml: "<p>短い本文(免責なし)</p>", body: "" },
        },
      }
    );
    flags.authEnabled = false;
    render(<ApproveClient />);
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    await screen.findByRole("dialog");
    expect(screen.getByRole("button", { name: "公開する" })).toBeDisabled();
    expect(screen.getByText(/公開前チェックに赤/)).toBeInTheDocument();
  });

  it("公開: 失敗するとエラーを表示する", async () => {
    await openPanel("drafted", { ok: false, status: 502, json: { success: false, error: "公開NG" } });
    await userEvent.click(screen.getByRole("button", { name: "公開する" }));
    await userEvent.click(await confirmDialogButton("公開を確定"));
    expect(await screen.findByText("公開NG")).toBeInTheDocument();
  });

  it("公開: error が無い失敗はフォールバック文言", async () => {
    await openPanel("drafted", { ok: false, status: 502, json: { success: false } });
    await userEvent.click(screen.getByRole("button", { name: "公開する" }));
    await userEvent.click(await confirmDialogButton("公開を確定"));
    expect(await screen.findByText("公開に失敗しました。")).toBeInTheDocument();
  });

  it("公開済み段階: 公開バッジを出し公開ボタンは出さない", async () => {
    await openPanel("published");
    const group = screen.getByRole("group", { name: "公開・クローズ" });
    expect(within(group).getByText("公開済み")).toBeInTheDocument();
    expect(within(group).queryByRole("button", { name: "公開する" })).not.toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "クローズ（盤から非表示）" })).toBeInTheDocument();
  });

  it("クローズ: 確認ダイアログ確定で decision=クローズ を POST する", async () => {
    const fn = await openPanel(
      "drafted",
      { json: { success: true } }, // close decision
      { json: { success: true, items: [] } } // pollBoard
    );
    await userEvent.click(screen.getByRole("button", { name: "クローズ（盤から非表示）" }));
    await userEvent.click(await confirmDialogButton("クローズを確定"));
    await waitFor(() =>
      expect(
        fn.mock.calls.some(
          (c) => String(c[0]).includes("/api/growth/approve") && c[1]?.method === "POST"
        )
      ).toBe(true)
    );
    const call = fn.mock.calls.find(
      (c) => String(c[0]).includes("/api/growth/approve") && c[1]?.method === "POST"
    )!;
    expect(JSON.parse(call[1].body).decisions[0].decision).toBe("クローズ");
  });

  it("クローズ: 失敗するとエラーを表示する", async () => {
    await openPanel("drafted", { ok: false, status: 502, json: { success: false, error: "クローズNG" } });
    await userEvent.click(screen.getByRole("button", { name: "クローズ（盤から非表示）" }));
    await userEvent.click(await confirmDialogButton("クローズを確定"));
    expect(await screen.findByText("クローズNG")).toBeInTheDocument();
  });

  it("クローズ: 確認ダイアログをキャンセルすると POST しない", async () => {
    const fn = await openPanel("drafted");
    await userEvent.click(screen.getByRole("button", { name: "クローズ（盤から非表示）" }));
    await userEvent.click(await confirmDialogButton("キャンセル"));
    expect(
      fn.mock.calls.some((c) => String(c[0]).includes("/api/growth/approve") && c[1]?.method === "POST")
    ).toBe(false);
  });
});

describe("ApproveClient 構成からやり直す(下書き→提案中)", () => {
  const REVERT_URL = "/api/growth/approve/revert";

  async function openDrafted(...after: Array<{ json?: unknown; ok?: boolean; status?: number }>) {
    const fn = mockFetchSequence(
      { json: { success: true, items: [ideaItem({ stage: "drafted", isDraftReady: true })] } },
      ...after
    );
    flags.authEnabled = false;
    render(<ApproveClient />);
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    return fn;
  }

  async function openStage(stage: string) {
    mockFetchSequence({
      json: { success: true, items: [ideaItem({ stage, isDraftReady: false })] },
    });
    flags.authEnabled = false;
    render(<ApproveClient />);
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
  }

  async function revertConfirmButton(name: string): Promise<HTMLElement> {
    const cd = await screen.findByRole("dialog", { name: "構成からやり直すの確認" });
    return within(cd).getByRole("button", { name });
  }

  it("下書き作成済み: 確認確定で revert API に pageId を POST しトーストを出す", async () => {
    const fn = await openDrafted(
      { json: { success: true } }, // revert
      { json: { success: true, items: [ideaItem({ stage: "proposed" })] } } // pollBoard
    );
    await userEvent.click(screen.getByRole("button", { name: "構成からやり直す" }));
    await userEvent.click(await revertConfirmButton("提案中に戻す"));
    await waitFor(() =>
      expect(fn.mock.calls.some((c) => String(c[0]).includes(REVERT_URL))).toBe(true)
    );
    const call = fn.mock.calls.find((c) => String(c[0]).includes(REVERT_URL))!;
    expect(JSON.parse(call[1].body).pageId).toBe("i1");
    expect(await screen.findByText(/提案中に戻しました/)).toBeInTheDocument();
  });

  it("確認ダイアログをキャンセルすると POST しない", async () => {
    const fn = await openDrafted();
    await userEvent.click(screen.getByRole("button", { name: "構成からやり直す" }));
    await userEvent.click(await revertConfirmButton("キャンセル"));
    expect(fn.mock.calls.some((c) => String(c[0]).includes(REVERT_URL))).toBe(false);
  });

  it("失敗するとエラートーストを出す", async () => {
    await openDrafted({ ok: false, status: 502, json: { success: false, error: "戻すNG" } });
    await userEvent.click(screen.getByRole("button", { name: "構成からやり直す" }));
    await userEvent.click(await revertConfirmButton("提案中に戻す"));
    expect(await screen.findByText("戻すNG")).toBeInTheDocument();
  });

  it("修正ループ busy 中はボタンを無効化する", async () => {
    mockFetchSequence({
      json: {
        success: true,
        items: [ideaItem({ stage: "drafted", isDraftReady: true, reviseStatus: "提示中" })],
      },
    });
    flags.authEnabled = false;
    render(<ApproveClient />);
    await screen.findByText("猛暑記事");
    await userEvent.click(screen.getByRole("button", { name: "詳細: 猛暑記事" }));
    await screen.findByRole("dialog", { name: "詳細: 猛暑記事" });
    expect(screen.getByRole("button", { name: "構成からやり直す" })).toBeDisabled();
  });

  it("生成中・公開済みでは構成からやり直すボタンを出さない(#H9)", async () => {
    await openStage("generating");
    expect(screen.queryByRole("button", { name: "構成からやり直す" })).not.toBeInTheDocument();
  });

  it("公開済みでは構成からやり直すボタンを出さない", async () => {
    await openStage("published");
    expect(screen.queryByRole("button", { name: "構成からやり直す" })).not.toBeInTheDocument();
  });
});

describe("ApproveClient 公開キュー(#H23/#H24)", () => {
  it("『今すぐ公開』で publish 後に盤を再取得する(onChanged→pollBoard)", async () => {
    flags.authEnabled = false;
    const fn = mockFetchSequence(
      {
        json: {
          success: true,
          items: [
            ideaItem({
              id: "i1",
              title: "公開可能下書き",
              stage: "drafted",
              isDraftReady: true,
              contentId: "g-1",
              eyecatchUrl: "https://images.microcms-assets.io/x.png",
              hasDraftBody: true,
            }),
          ],
        },
      },
      { json: { success: true } }, // /api/growth/publish
      { json: { success: true, items: [] } }, // pollBoard 再取得
    );
    render(<ApproveClient />);
    await screen.findByRole("tab", { name: /記事/ });
    await selectTab(/記事/);
    await userEvent.click(await screen.findByRole("button", { name: /公開キュー/ }));
    await userEvent.click(screen.getByRole("button", { name: /今すぐ公開/ }));

    await waitFor(() =>
      expect(fn.mock.calls.some((c) => String(c[0]) === "/api/growth/publish")).toBe(true)
    );
    // onChanged → pollBoard が承認 API を再取得する(初回＋ポーリングで2回以上)。
    await waitFor(() =>
      expect(
        fn.mock.calls.filter((c) => String(c[0]).includes("/api/growth/approve")).length
      ).toBeGreaterThanOrEqual(2)
    );
  });
});
