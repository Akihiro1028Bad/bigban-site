import { GoogleAnalytics } from "@next/third-parties/google";
import { GA_MEASUREMENT_ID } from "@/constants/analytics";

// 本番デプロイ時のみ計測する。開発・Preview で描画するとテストアクセスで
// 本番の計測データが汚れるため、VERCEL_ENV で本番だけに限定する。
export default function GoogleAnalyticsTag() {
  if (process.env.VERCEL_ENV !== "production") {
    return null;
  }

  return <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />;
}
