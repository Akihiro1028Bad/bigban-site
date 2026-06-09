import { GoogleAnalytics } from "@next/third-parties/google";
import { GA_MEASUREMENT_ID } from "@/constants/analytics";

/**
 * GA4 タグを描画するサーバーコンポーネント。
 *
 * 本番デプロイ (VERCEL_ENV === "production") のときのみ計測タグを出力する。
 * ローカル開発や Preview デプロイでは描画しないため、テストアクセスで
 * 本番の計測データが汚れることを防ぐ。
 */
export default function GoogleAnalyticsTag() {
  if (process.env.VERCEL_ENV !== "production") {
    return null;
  }

  return <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />;
}
