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

describe("APPROVE_AUTH_ENABLED", () => {
  it("既定では false(合言葉認証は一旦オフ。復元は true に戻す)", async () => {
    const { APPROVE_AUTH_ENABLED } = await import("./featureFlags");
    expect(APPROVE_AUTH_ENABLED).toBe(false);
  });
});
