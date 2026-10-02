import { beforeEach, describe, expect, it, vi } from "vitest";

const isCmsColumnsEnabledMock = vi.fn();
vi.mock("@/config/featureFlags", () => ({
  isCmsColumnsEnabled: () => isCmsColumnsEnabledMock(),
}));

const getColumnsListMock = vi.fn();
vi.mock("@/lib/microcms/columnsQueries", () => ({
  getColumnsList: (args: unknown) => getColumnsListMock(args),
}));

import { shouldShowColumns } from "./visibility";

describe("shouldShowColumns", () => {
  beforeEach(() => {
    isCmsColumnsEnabledMock.mockReset().mockReturnValue(true);
    getColumnsListMock.mockReset();
  });

  it("フラグが無効なら言語にかかわらず false(CMS を問い合わせない)", async () => {
    isCmsColumnsEnabledMock.mockReturnValue(false);
    await expect(shouldShowColumns("ja")).resolves.toBe(false);
    await expect(shouldShowColumns("en")).resolves.toBe(false);
    expect(getColumnsListMock).not.toHaveBeenCalled();
  });

  it("日本語はフラグが有効なら true(CMS を問い合わせない)", async () => {
    await expect(shouldShowColumns("ja")).resolves.toBe(true);
    expect(getColumnsListMock).not.toHaveBeenCalled();
  });

  it("英語は英語コラムが1本以上あれば true", async () => {
    getColumnsListMock.mockResolvedValue({ contents: [], totalCount: 1 });
    await expect(shouldShowColumns("en")).resolves.toBe(true);
    expect(getColumnsListMock).toHaveBeenCalledWith({
      locale: "en",
      limit: 1,
      offset: 0,
    });
  });

  it("英語は英語コラムが0本なら false", async () => {
    getColumnsListMock.mockResolvedValue({ contents: [], totalCount: 0 });
    await expect(shouldShowColumns("en")).resolves.toBe(false);
  });

  it("英語の取得に失敗したら false(エラーはログに残す)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getColumnsListMock.mockRejectedValue(new Error("boom"));
    await expect(shouldShowColumns("en")).resolves.toBe(false);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
