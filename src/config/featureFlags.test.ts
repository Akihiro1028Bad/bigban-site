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

describe("APPROVE_AUTH_ENABLED (フェイルセーフ: 既定ON)", () => {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("未設定なら有効(true)=フェイルセーフ(本番で認証が外れない)", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "");
    const { APPROVE_AUTH_ENABLED } = await import("./featureFlags");
    expect(APPROVE_AUTH_ENABLED).toBe(true);
  });

  it("'false' のときだけ無効(dev 用に明示的に外す)", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "false");
    const { APPROVE_AUTH_ENABLED } = await import("./featureFlags");
    expect(APPROVE_AUTH_ENABLED).toBe(false);
  });

  it("'true' で有効", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "true");
    const { APPROVE_AUTH_ENABLED } = await import("./featureFlags");
    expect(APPROVE_AUTH_ENABLED).toBe(true);
  });

  it("想定外の値は有効(明示 false 以外はON=フェイルセーフ)", async () => {
    vi.stubEnv("APPROVE_AUTH_ENABLED", "yes");
    const { APPROVE_AUTH_ENABLED } = await import("./featureFlags");
    expect(APPROVE_AUTH_ENABLED).toBe(true);
  });
});
