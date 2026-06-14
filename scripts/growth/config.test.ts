// @vitest-environment node
import { describe, it, expect } from "vitest";

import { loadGrowthConfig } from "./config";

const validEnv = {
  GROWTH_GA4_PROPERTY_ID: "540956661",
  GROWTH_GSC_SITE_URL: "https://www.thepicklebang.com/",
  GROWTH_GOOGLE_CLIENT_ID: "client-id-123",
  GROWTH_GOOGLE_CLIENT_SECRET: "client-secret-456",
  GROWTH_GOOGLE_REFRESH_TOKEN: "refresh-token-789",
};

describe("loadGrowthConfig", () => {
  it("妥当な環境変数から設定オブジェクトを生成する", () => {
    expect(loadGrowthConfig(validEnv)).toEqual({
      ga4PropertyId: "540956661",
      gscSiteUrl: "https://www.thepicklebang.com/",
      googleClientId: "client-id-123",
      googleClientSecret: "client-secret-456",
      googleRefreshToken: "refresh-token-789",
    });
  });

  it("必須項目が欠けている場合は項目名を含むエラーを投げる", () => {
    const { GROWTH_GOOGLE_REFRESH_TOKEN, ...missing } = validEnv;
    void GROWTH_GOOGLE_REFRESH_TOKEN;
    expect(() => loadGrowthConfig(missing)).toThrowError(
      /GROWTH_GOOGLE_REFRESH_TOKEN/
    );
  });

  it("空文字の項目も欠落として扱う", () => {
    expect(() =>
      loadGrowthConfig({ ...validEnv, GROWTH_GA4_PROPERTY_ID: "" })
    ).toThrowError(/GROWTH_GA4_PROPERTY_ID/);
  });

  it("GSC URL が http(s) 形式でない場合はエラーを投げる", () => {
    expect(() =>
      loadGrowthConfig({ ...validEnv, GROWTH_GSC_SITE_URL: "thepicklebang.com" })
    ).toThrowError(/GROWTH_GSC_SITE_URL/);
  });

  it("GA4 プロパティ ID が数値文字列でない場合はエラーを投げる", () => {
    expect(() =>
      loadGrowthConfig({ ...validEnv, GROWTH_GA4_PROPERTY_ID: "abc" })
    ).toThrowError(/GROWTH_GA4_PROPERTY_ID/);
  });

  it("余分な前後空白はトリムする", () => {
    const config = loadGrowthConfig({
      ...validEnv,
      GROWTH_GA4_PROPERTY_ID: "  540956661  ",
    });
    expect(config.ga4PropertyId).toBe("540956661");
  });
});
