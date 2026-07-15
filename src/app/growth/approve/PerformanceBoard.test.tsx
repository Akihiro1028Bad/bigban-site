import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { PendingItem } from "@/lib/growth/approve";
import type { ArticleMetrics } from "@/lib/growth/metrics";

import { PerformanceBoard } from "./PerformanceBoard";

function metrics(views: number, viewsDelta: number | null, users: number): ArticleMetrics {
  return {
    pagePath: "/news/x",
    views: { current: views, prior: 0, deltaPct: viewsDelta },
    users: { current: users, prior: 0, deltaPct: null },
    period: { start: "2026-06-15", end: "2026-06-21" },
  };
}

function published(
  id: string,
  title: string,
  m?: ArticleMetrics,
  extra?: Partial<PendingItem>
): PendingItem {
  return {
    id,
    kind: "idea",
    title,
    subtitle: "",
    details: [],
    score: 0,
    stage: "published",
    metrics: m,
    ...extra,
  };
}

describe("PerformanceBoard", () => {
  it("検索成績なしでも予約意図・SNS・その他CTAをイベント別に表示する", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(100, 20, 50),
      ctaEventsMeasured: true,
      ctaEvents: {
        reservationClick: { current: 0, prior: 2, deltaPct: -100 },
        reserveEntryClick: { current: 0, prior: 0, deltaPct: null },
        lineClick: { current: 4, prior: 2, deltaPct: 100 },
        instagramClick: { current: 3, prior: 1, deltaPct: 200 },
        other: { current: 0, prior: 0, deltaPct: null },
      },
    };
    render(<PerformanceBoard items={[published("a", "イベント別記事", m)]} />);
    await user.click(screen.getByRole("button", { name: /イベント別記事/ }));

    expect(screen.getByText("予約意図")).toBeInTheDocument();
    expect(screen.getByText("reservation_click")).toBeInTheDocument();
    expect(screen.getByText("reserve_entry_click")).toBeInTheDocument();
    expect(screen.getByText("SNS")).toBeInTheDocument();
    expect(screen.getByText("LINE")).toBeInTheDocument();
    expect(screen.getByText("Instagram")).toBeInTheDocument();
    expect(screen.getByText("その他CTA")).toBeInTheDocument();
    expect(screen.getAllByText(/今週 0.*前週 2.*-100%/)).toHaveLength(2);
    expect(screen.getByText(/今週 4.*前週 2.*\+100%/)).toBeInTheDocument();
  });

  it("freshな施設全体実予約と記事帰属実予約、最終取込時刻を区別する", async () => {
    const user = userEvent.setup();
    const syncedAt = new Date(Date.now() - 86_400_000).toISOString();
    const m: ArticleMetrics = {
      ...metrics(100, 20, 50),
      actualReservations: {
        state: "available",
        source: "csv",
        syncedAt,
        facility: { current: 8, prior: 5, deltaPct: 60 },
        article: { current: 2, prior: 1, deltaPct: 100 },
      },
    };
    render(<PerformanceBoard items={[published("a", "実予約記事", m)]} />);
    expect(screen.getByText("施設全体の実予約")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /実予約記事/ }));
    expect(screen.getByText(/記事帰属の実予約/)).toBeInTheDocument();
    expect(screen.getByText(/最終取込/)).toBeInTheDocument();
  });

  it("実予約欠損時は予約意図を代理指標と明示する", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(100, 20, 50),
      actualReservations: {
        state: "missing",
        reason: "not_configured",
        checkedAt: new Date().toISOString(),
      },
    };
    render(<PerformanceBoard items={[published("a", "欠損記事", m)]} />);
    await user.click(screen.getByRole("button", { name: /欠損記事/ }));
    expect(screen.getByText(/実予約は未取得/)).toBeInTheDocument();
    expect(screen.getByText(/予約意図を代理指標/)).toBeInTheDocument();
  });

  it("予約CSVの当週・前週収録状態を区別して表示する", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(0, null, 0),
      ga4Measured: false,
      actualReservations: {
        state: "missing",
        reason: "coverage_incomplete",
        checkedAt: new Date().toISOString(),
        coverage: {
          start: "2026-07-07",
          end: "2026-07-13",
          current: true,
          prior: false,
        },
      },
    };
    const currentMissing: ArticleMetrics = {
      ...m,
      actualReservations: {
        state: "missing",
        reason: "coverage_incomplete",
        checkedAt: new Date().toISOString(),
        coverage: {
          start: "2026-06-30",
          end: "2026-07-06",
          current: false,
          prior: true,
        },
      },
    };
    render(<PerformanceBoard items={[
      published("a", "前週収録不足記事", m),
      published("b", "当週収録不足記事", currentMissing),
    ]} />);
    await user.click(screen.getByRole("button", { name: /前週収録不足記事/ }));
    expect(screen.getByText(/当週=収録.*前週=未収録/)).toBeInTheDocument();
    expect(screen.getByText(/予約意図を代理指標/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /当週収録不足記事/ }));
    expect(screen.getByText(/当週=未収録.*前週=収録/)).toBeInTheDocument();
  });

  it("古い実予約と記事帰属なしを明示する", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(100, 20, 50),
      actualReservations: {
        state: "available",
        source: "csv",
        syncedAt: "2020-01-01T00:00:00.000Z",
        facility: { current: 8, prior: 5, deltaPct: 60 },
        article: null,
      },
    };
    render(<PerformanceBoard items={[published("a", "古い実予約記事", m)]} />);
    expect(screen.getByText("施設全体の実予約（古い）")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /古い実予約記事/ }));
    expect(screen.getByText("実予約（データが古い・予約意図を代理指標）")).toBeInTheDocument();
    expect(screen.getByText("施設全体の実予約のみ（記事別帰属なし）")).toBeInTheDocument();
  });

  it("イベント内訳が存在しても未計測なら0件表示せず未計測を明示する", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(100, 20, 50),
      ctaEventsMeasured: false,
      ctaEvents: {
        reservationClick: { current: 0, prior: 0, deltaPct: null },
        reserveEntryClick: { current: 0, prior: 0, deltaPct: null },
        lineClick: { current: 0, prior: 0, deltaPct: null },
        instagramClick: { current: 0, prior: 0, deltaPct: null },
        other: { current: 0, prior: 0, deltaPct: null },
      },
    };
    render(<PerformanceBoard items={[published("a", "イベント未計測記事", m)]} />);
    await user.click(screen.getByRole("button", { name: /イベント未計測記事/ }));
    expect(screen.getByText(/イベント別未計測です/)).toBeInTheDocument();
    expect(screen.queryByText("reservation_click")).not.toBeInTheDocument();
  });

  it("計測データが無ければ空メッセージを出す", () => {
    render(<PerformanceBoard items={[published("a", "未計測")]} />);
    expect(screen.getByText(/まだ計測データがありません/)).toBeInTheDocument();
    // 空のときは行リストを出さない。
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("GA4取得失敗と実測0を別表示し、失敗記事をサマリー集計から除外する", () => {
    render(<PerformanceBoard items={[
      published("zero", "実測0記事", { ...metrics(0, null, 0), measurementStatus: "measured", ga4Measured: true }),
      published("error", "取得失敗記事", { ...metrics(0, null, 0), measurementStatus: "source-error", ga4Measured: false }),
    ]} />);
    expect(screen.getByText("GA4取得失敗")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /取得失敗記事/ })).toHaveTextContent("—");
    expect(screen.getByRole("button", { name: /実測0記事/ })).toHaveTextContent("0");
    expect(screen.getByText("計測記事数").parentElement).toHaveTextContent("1");
    expect(screen.getByText("合計表示数").parentElement).toHaveTextContent("0");
  });

  it("path-unmatchedは明示的0とパス不一致・28日後の要改稿を表示する", () => {
    render(<PerformanceBoard items={[published("path", "不一致記事", {
      ...metrics(0, null, 0),
      measurementStatus: "path-unmatched",
      ga4Measured: false,
      publishedAt: "2020-01-01T00:00:00.000Z",
    })]} />);
    expect(screen.getByText("GA4パス不一致")).toBeInTheDocument();
    expect(screen.getByText("要改稿")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /不一致記事/ })).toHaveTextContent("0");
  });

  it("source-errorだけでも空状態にせず失敗行を表示する", () => {
    render(<PerformanceBoard items={[published("error", "失敗のみ", {
      ...metrics(0, null, 0), measurementStatus: "source-error", ga4Measured: false,
    })]} />);
    expect(screen.queryByText(/まだ計測データがありません/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /失敗のみ/ })).toBeInTheDocument();
  });

  it("CTA部分計測は完全計測・未計測と異なる注記を表示する", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(100, 0, 50),
      ctaEventsMeasurementStatus: "partial",
      ctaEventsMeasured: false,
      ctaEvents: {
        reservationClick: { current: 1, prior: 0, deltaPct: null },
        reserveEntryClick: { current: 0, prior: 0, deltaPct: null },
        lineClick: { current: 0, prior: 0, deltaPct: null },
        instagramClick: { current: 0, prior: 0, deltaPct: null },
        other: { current: 0, prior: 0, deltaPct: null },
      },
    };
    render(<PerformanceBoard items={[published("partial", "部分計測記事", m)]} />);
    await user.click(screen.getByRole("button", { name: /部分計測記事/ }));
    expect(screen.getByText(/設定日以降の一部期間のみ計測/)).toBeInTheDocument();
    expect(screen.getByText("reservation_click")).toBeInTheDocument();
  });

  it("計測済み記事を表示数の多い順に並べ、合計と前週比を出す", () => {
    const items = [
      published("a", "記事A", metrics(100, 20, 50)),
      published("b", "記事B", metrics(300, -10, 80)),
      published("c", "未計測"),
    ];
    render(<PerformanceBoard items={items} />);

    // 合計(表示 400, ユーザー 130)。
    expect(screen.getByText("400")).toBeInTheDocument();
    expect(screen.getByText("130")).toBeInTheDocument();
    // 計測記事数(未計測を除く 2)。
    expect(screen.getByText("2")).toBeInTheDocument();

    const list = screen.getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    // 表示数の多い B が先頭。
    expect(rows[0]).toHaveTextContent("記事B");
    expect(rows[1]).toHaveTextContent("記事A");
    expect(rows).toHaveLength(2); // 未計測は出さない

    // 前週比のトーン違い(上昇/下降)が両方描画される(+20% は伸びバナーと行の両方に出る)。
    expect(within(rows[1]).getByText("+20%")).toBeInTheDocument();
    expect(within(rows[0]).getByText("-10%")).toBeInTheDocument();
  });

  it("最も伸びた記事(前週比プラス最大)をバナーに出す", () => {
    // views 降順(c→a→b)で iterate。急伸(b) が後に来るので更新分岐、a は更新せず据え置き分岐を通す。
    const items = [
      published("a", "微増記事", metrics(100, 5, 50)),
      published("b", "急伸記事", metrics(80, 40, 30)),
      published("c", "先頭据え置き", metrics(300, 10, 90)),
    ];
    render(<PerformanceBoard items={items} />);
    // バナー root は「いちばん伸びた記事」ラベルから 2 段上(ラベル div → 本文 div → banner）。
    const label = screen.getByText("いちばん伸びた記事");
    const banner = label.parentElement?.parentElement;
    expect(banner).not.toBeNull();
    expect(banner).toHaveTextContent("急伸記事");
    expect(banner).toHaveTextContent("+40%");
  });

  it("前週比がプラスの記事が無ければ伸びたバナーは出さない", () => {
    render(<PerformanceBoard items={[published("a", "下降", metrics(50, -10, 20))]} />);
    expect(screen.queryByText("いちばん伸びた記事")).not.toBeInTheDocument();
  });

  it("横ばい(±0%)・未計測(—)の前週比も描画できる", () => {
    const items = [
      published("a", "横ばい", metrics(10, 0, 5)),
      published("b", "差分なし", metrics(20, null, 5)),
    ];
    render(<PerformanceBoard items={items} />);
    expect(screen.getByText("±0%")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("行を開くと GSC検索成績(search)のクリック/CTR/順位/CTA/上位クエリを出す(#S2)", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(100, 20, 50),
      keyEvents: { current: 7, prior: 3, deltaPct: 133 },
      search: {
        clicks: { current: 12, prior: 8, deltaPct: 50 },
        impressions: { current: 200, prior: 150, deltaPct: 33.3 },
        ctr: { current: 0.06, prior: 0.05, deltaPct: 20 },
        position: { current: 3.2, prior: 4.1, deltaPct: -22 },
        topQueries: [{ query: "本八幡 ピックルボール", clicks: 6, impressions: 60, ctr: 0.1, position: 2.5 }],
      },
    };
    render(<PerformanceBoard items={[published("a", "検索成績あり", m)]} />);

    // 展開前は検索成績は非表示。
    expect(screen.queryByText("クリック")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /検索成績あり/ }));

    expect(screen.getByText("クリック")).toBeInTheDocument();
    expect(screen.getByText("CTR")).toBeInTheDocument();
    expect(screen.getByText("6%")).toBeInTheDocument();
    expect(screen.getByText("3.2位")).toBeInTheDocument();
    expect(screen.getByText(/CTA/)).toBeInTheDocument();
    expect(screen.getByText(/本八幡 ピックルボール/)).toBeInTheDocument();
  });

  it("行を開いても search 無しの記事は「検索成績は未計測です」を出す(後方互換)", async () => {
    const user = userEvent.setup();
    render(<PerformanceBoard items={[published("a", "旧データ", metrics(10, null, 5))]} />);
    await user.click(screen.getByRole("button", { name: /旧データ/ }));
    expect(screen.getByText("検索成績は未計測です。")).toBeInTheDocument();
    expect(screen.queryByText("クリック")).not.toBeInTheDocument();
  });

  it("#218: search 無しでも keyEvents があれば CTA(キーイベント)を表示する", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(10, null, 5),
      keyEvents: { current: 6, prior: 2, deltaPct: 200 },
    };
    render(<PerformanceBoard items={[published("a", "予約導線記事", m)]} />);
    await user.click(screen.getByRole("button", { name: /予約導線記事/ }));
    expect(screen.getByText("検索成績は未計測です。")).toBeInTheDocument();
    expect(screen.getByText(/CTA/)).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
  });

  it("keyEventsMeasured が false なら CTA 数値ではなく未計測を表示する", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(10, null, 5),
      keyEvents: { current: 6, prior: 2, deltaPct: 200 },
      keyEventsMeasured: false,
      search: {
        clicks: { current: 3, prior: 0, deltaPct: null },
        impressions: { current: 90, prior: 0, deltaPct: null },
        ctr: { current: 0.033, prior: 0, deltaPct: null },
        position: { current: 8, prior: 0, deltaPct: null },
        topQueries: [],
      },
    };
    render(<PerformanceBoard items={[published("a", "未計測記事", m)]} />);
    await user.click(screen.getByRole("button", { name: /未計測記事/ }));

    expect(screen.getByText(/CTA/)).toBeInTheDocument();
    expect(screen.getByText("未計測")).toBeInTheDocument();
    expect(screen.queryByText("6")).not.toBeInTheDocument();
  });

  it("再クリックで行を閉じる(トグル)", async () => {
    const user = userEvent.setup();
    render(<PerformanceBoard items={[published("a", "旧データ", metrics(10, null, 5))]} />);
    const row = screen.getByRole("button", { name: /旧データ/ });
    await user.click(row);
    expect(screen.getByText("検索成績は未計測です。")).toBeInTheDocument();
    await user.click(row);
    expect(screen.queryByText("検索成績は未計測です。")).not.toBeInTheDocument();
  });

  it("search はあるが keyEvents 無し・topQueries 空なら CTA/クエリは出さない", async () => {
    const user = userEvent.setup();
    const m: ArticleMetrics = {
      ...metrics(40, null, 20),
      search: {
        clicks: { current: 3, prior: 0, deltaPct: null },
        impressions: { current: 90, prior: 0, deltaPct: null },
        ctr: { current: 0.033, prior: 0, deltaPct: null },
        position: { current: 8, prior: 0, deltaPct: null },
        topQueries: [],
      },
    };
    render(<PerformanceBoard items={[published("a", "検索のみ記事", m)]} />);
    await user.click(screen.getByRole("button", { name: /検索のみ記事/ }));
    expect(screen.getByText("クリック")).toBeInTheDocument();
    expect(screen.queryByText(/CTA/)).not.toBeInTheDocument();
    expect(screen.queryByText("上位クエリ")).not.toBeInTheDocument();
  });

  it("判定ラベル(#S3)を表示する: 伸びている/CTR弱い", () => {
    // publishedAt 付き(daysSincePublished 経路を通す)。views=100 なので要改稿は付かない。
    const grow: ArticleMetrics = { ...metrics(100, 20, 50), publishedAt: "2026-06-20T00:00:00Z" };
    const weak: ArticleMetrics = {
      ...metrics(100, 0, 60), // keyEvents>0(下記)・views横ばい
      keyEvents: { current: 4, prior: 4, deltaPct: 0 },
      search: {
        clicks: { current: 2, prior: 2, deltaPct: 0 },
        impressions: { current: 300, prior: 0, deltaPct: null }, // imp>=100
        ctr: { current: 0.006, prior: 0, deltaPct: null }, // ctr<0.03 → CTR弱い
        position: { current: 2, prior: 0, deltaPct: null }, // 5未満 → 順位ラベルは付かない
        topQueries: [],
      },
    };
    render(<PerformanceBoard items={[published("a", "伸び記事", grow), published("b", "弱記事", weak)]} />);
    expect(screen.getByText("伸びている")).toBeInTheDocument();
    expect(screen.getByText("CTR弱い")).toBeInTheDocument();
  });

  it("ラベルが無い記事(公開日不明・低調横ばい)はラベル行を出さない", () => {
    render(<PerformanceBoard items={[published("a", "ラベル無し", metrics(10, 0, 5))]} />);
    expect(screen.queryByText("伸びている")).not.toBeInTheDocument();
  });

  it("onAddIdea 指定時、バナーと展開行の CTA からネタ案追加できる", async () => {
    const user = userEvent.setup();
    const onAddIdea = vi.fn();
    const m: ArticleMetrics = {
      ...metrics(100, 30, 50),
      search: {
        clicks: { current: 5, prior: 0, deltaPct: null },
        impressions: { current: 100, prior: 0, deltaPct: null },
        ctr: { current: 0.05, prior: 0, deltaPct: null },
        position: { current: 4, prior: 0, deltaPct: null },
        topQueries: [{ query: "テスト", clicks: 3, impressions: 30, ctr: 0.1, position: 3 }],
      },
    };
    // contentId 付き=アイキャッチ有り(EyecatchThumb の has=true 経路)。
    render(
      <PerformanceBoard
        items={[published("a", "伸び記事", m, { contentId: "cid-1" })]}
        onAddIdea={onAddIdea}
      />
    );

    await user.click(screen.getByRole("button", { name: "似た企画をネタ案に" }));
    expect(onAddIdea).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }));

    await user.click(screen.getByRole("button", { name: /伸び記事/ }));
    await user.click(screen.getByRole("button", { name: "似た企画をネタ案に追加" }));
    expect(onAddIdea).toHaveBeenCalledTimes(2);
  });

  it("onAddIdea 未指定なら CTA ボタンは出さない", async () => {
    const user = userEvent.setup();
    render(<PerformanceBoard items={[published("a", "伸び記事", metrics(100, 30, 50))]} />);
    expect(screen.queryByRole("button", { name: /似た企画をネタ案に/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /伸び記事/ }));
    expect(screen.queryByRole("button", { name: /似た企画をネタ案に追加/ })).not.toBeInTheDocument();
  });
});
