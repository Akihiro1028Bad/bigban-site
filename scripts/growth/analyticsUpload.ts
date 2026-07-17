export interface AnalyticsUploadEnv {
  GROWTH_ANALYTICS_UPLOAD_URL?: string;
  GROWTH_ANALYTICS_INGEST_TOKEN?: string;
}

export interface AnalyticsUploadResponse {
  ok: boolean;
  status: number;
}

export type AnalyticsUploadFetch = (url: string, init: RequestInit) => Promise<AnalyticsUploadResponse>;

/** 環境変数が揃う時だけ、PCから経営ボード受け口へ送る関数を作る。 */
export function analyticsSnapshotUploader(
  env: AnalyticsUploadEnv,
  fetchFn: AnalyticsUploadFetch,
  log: (message: string) => void
): ((json: string) => Promise<void>) | undefined {
  const url = env.GROWTH_ANALYTICS_UPLOAD_URL;
  const token = env.GROWTH_ANALYTICS_INGEST_TOKEN;
  if (!url || !token) {
    log("[ingest] 経営ボードのアップロード設定が未設定のためスキップ");
    return undefined;
  }
  return async (body: string): Promise<void> => {
    const response = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`経営ボードへのアップロードに失敗しました(HTTP ${response.status})`);
  };
}
