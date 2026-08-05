import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("isCmsNewsEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("'true' で true", async () => {
    vi.stubEnv("USE_CMS_NEWS", "true");
    const { isCmsNewsEnabled } = await import("./featureFlags");
    expect(isCmsNewsEnabled()).toBe(true);
  });

  it("'false' で false", async () => {
    vi.stubEnv("USE_CMS_NEWS", "false");
    const { isCmsNewsEnabled } = await import("./featureFlags");
    expect(isCmsNewsEnabled()).toBe(false);
  });

  it("未設定で false", async () => {
    vi.stubEnv("USE_CMS_NEWS", "");
    const { isCmsNewsEnabled } = await import("./featureFlags");
    expect(isCmsNewsEnabled()).toBe(false);
  });

  it("想定外の値で false", async () => {
    vi.stubEnv("USE_CMS_NEWS", "yes");
    const { isCmsNewsEnabled } = await import("./featureFlags");
    expect(isCmsNewsEnabled()).toBe(false);
  });
});

describe("isCmsColumnsEnabled", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("'true' で true", async () => {
    vi.stubEnv("USE_CMS_COLUMNS", "true");
    const { isCmsColumnsEnabled } = await import("./featureFlags");
    expect(isCmsColumnsEnabled()).toBe(true);
  });

  it("'false' で false", async () => {
    vi.stubEnv("USE_CMS_COLUMNS", "false");
    const { isCmsColumnsEnabled } = await import("./featureFlags");
    expect(isCmsColumnsEnabled()).toBe(false);
  });

  it("未設定で false", async () => {
    vi.stubEnv("USE_CMS_COLUMNS", "");
    const { isCmsColumnsEnabled } = await import("./featureFlags");
    expect(isCmsColumnsEnabled()).toBe(false);
  });

  it("想定外の値で false", async () => {
    vi.stubEnv("USE_CMS_COLUMNS", "yes");
    const { isCmsColumnsEnabled } = await import("./featureFlags");
    expect(isCmsColumnsEnabled()).toBe(false);
  });
});
