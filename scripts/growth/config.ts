/**
 * グロースループ データ取得スクリプトの設定を環境変数から読み込み、
 * Zod で検証する。欠落・不正があれば項目名を含むエラーを投げて即座に失敗させる。
 */

import { z } from "zod";

export interface GrowthConfig {
  ga4PropertyId: string;
  gscSiteUrl: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
}

const requiredString = z.string().trim().min(1);

const envSchema = z.object({
  GROWTH_GA4_PROPERTY_ID: requiredString.regex(
    /^\d+$/,
    "数値の GA4 プロパティ ID を指定してください"
  ),
  GROWTH_GSC_SITE_URL: requiredString.regex(
    /^https?:\/\//,
    "http(s):// から始まる URL を指定してください"
  ),
  GROWTH_GOOGLE_CLIENT_ID: requiredString,
  GROWTH_GOOGLE_CLIENT_SECRET: requiredString,
  GROWTH_GOOGLE_REFRESH_TOKEN: requiredString,
});

export function loadGrowthConfig(
  env: Record<string, string | undefined>
): GrowthConfig {
  const result = envSchema.safeParse(env);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`グロースループの環境変数が不正です:\n${details}`);
  }

  const env_ = result.data;
  return {
    ga4PropertyId: env_.GROWTH_GA4_PROPERTY_ID,
    gscSiteUrl: env_.GROWTH_GSC_SITE_URL,
    googleClientId: env_.GROWTH_GOOGLE_CLIENT_ID,
    googleClientSecret: env_.GROWTH_GOOGLE_CLIENT_SECRET,
    googleRefreshToken: env_.GROWTH_GOOGLE_REFRESH_TOKEN,
  };
}
