import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const isCmsNewsEnabledMock = vi.fn(() => true);
vi.mock("@/config/featureFlags", () => ({
  isCmsNewsEnabled: () => isCmsNewsEnabledMock(),
}));

const getNewsListMock = vi.fn();
vi.mock("@/lib/microcms/queries", () => ({
  getNewsList: (args: unknown) => getNewsListMock(args),
}));

const getTranslationsMock = vi.fn();
vi.mock("next-intl/server", () => ({
  getTranslations: (...args: unknown[]) => getTranslationsMock(...args),
}));

const dictionary: Record<string, Record<string, string>> = {
  ja: {
    title: "NEWS",
    titleJa: "ニュース",
    subtitle: "最新のお知らせ・メディア掲載・イベント情報",
    viewAll: "すべてのニュースを見る",
  },
  en: {
    title: "NEWS",
    titleJa: "News",
    subtitle: "Latest announcements, media coverage, and event information",
    viewAll: "VIEW ALL NEWS",
  },
};

function buildT(locale: "ja" | "en") {
  return (key: string) => dictionary[locale][key] ?? key;
}

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, ...props }: Record<string, unknown>) => (
    <a href={href as string} {...props}>{children as React.ReactNode}</a>
  ),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill, priority, ...rest } = props;
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        {...rest}
        data-fill={fill ? "true" : undefined}
        data-priority={priority ? "true" : undefined}
      />
    );
  },
}));

function makeItem(id: string, slug: string, title: string) {
  return {
    id,
    slug,
    title,
    excerpt: "excerpt",
    locale: "ja" as const,
    category: ["notice"] as ["notice"],
    displayMode: "html" as const,
    bodyHtml: "",
    body: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    publishedAt: "2026-01-01T00:00:00.000Z",
  };
}

async function renderHomeNews(locale: "ja" | "en" = "ja") {
  getTranslationsMock.mockImplementation(async () => buildT(locale));
  const { default: HomeNews } = await import("./HomeNews");
  const element = await HomeNews({ locale });
  return render(element);
}

describe("HomeNews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isCmsNewsEnabledMock.mockReturnValue(true);
  });

  it("CMS フラグ OFF のときは何も描画しない", async () => {
    isCmsNewsEnabledMock.mockReturnValue(false);
    const { container } = await renderHomeNews("ja");
    expect(container.firstChild).toBeNull();
    expect(getNewsListMock).not.toHaveBeenCalled();
  });

  it("ニュース 0 件のときは何も描画しない", async () => {
    getNewsListMock.mockResolvedValueOnce({
      contents: [],
      totalCount: 0,
      offset: 0,
      limit: 3,
    });
    const { container } = await renderHomeNews("ja");
    expect(container.firstChild).toBeNull();
  });

  it("microCMS 取得失敗時は何も描画しない (rejected)", async () => {
    // 取得失敗時の意図的な console.error（別テストで検証済み）はノイズになるため抑制
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getNewsListMock.mockRejectedValueOnce(new Error("microcms down"));
    const { container } = await renderHomeNews("ja");
    expect(container.firstChild).toBeNull();
    errorSpy.mockRestore();
  });

  it("microCMS 取得失敗時にサーバーログへ console.error する (Vercel Function logs で追跡可能にする)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchError = new Error("microcms down");
    getNewsListMock.mockRejectedValueOnce(fetchError);
    await renderHomeNews("ja");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("HomeNews"),
      fetchError,
    );
    errorSpy.mockRestore();
  });

  it("ニュース 3 件と ‘すべてのニュースを見る’ リンクを描画する (ja)", async () => {
    getNewsListMock.mockResolvedValueOnce({
      contents: [
        makeItem("1", "n-1", "ニュース1"),
        makeItem("2", "n-2", "ニュース2"),
        makeItem("3", "n-3", "ニュース3"),
      ],
      totalCount: 3,
      offset: 0,
      limit: 3,
    });
    const { container } = await renderHomeNews("ja");

    expect(getNewsListMock).toHaveBeenCalledWith({
      locale: "ja",
      limit: 3,
      offset: 0,
    });

    expect(screen.getByText("ニュース1")).toBeInTheDocument();
    expect(screen.getByText("ニュース2")).toBeInTheDocument();
    expect(screen.getByText("ニュース3")).toBeInTheDocument();

    const viewAll = screen.getByRole("link", { name: "すべてのニュースを見る" });
    expect(viewAll).toHaveAttribute("href", "/news");

    const section = container.querySelector("section#news");
    expect(section).toBeInTheDocument();
  });

  it("英語ロケールで getNewsList が locale=en で呼ばれ、CTA が英語ラベル", async () => {
    getNewsListMock.mockResolvedValueOnce({
      contents: [makeItem("1", "n-1", "News 1")],
      totalCount: 1,
      offset: 0,
      limit: 3,
    });
    await renderHomeNews("en");

    expect(getNewsListMock).toHaveBeenCalledWith({
      locale: "en",
      limit: 3,
      offset: 0,
    });

    const viewAll = screen.getByRole("link", { name: "VIEW ALL NEWS" });
    expect(viewAll).toHaveAttribute("href", "/news");
  });
});
