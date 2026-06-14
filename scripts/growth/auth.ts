/**
 * OAuth 2.0 のリフレッシュトークンからアクセストークンを取得する。
 *
 * Google 側のサービスアカウント追加バグを回避するため、オーナー自身の
 * アカウントで発行したリフレッシュトークンを用いる(設計書 8 章参照)。
 * テスト容易性のため、トークンクライアントの生成は注入可能にしている。
 */

import { UserRefreshClient } from "google-auth-library";

import type { GrowthConfig } from "./config";

export interface TokenClient {
  getAccessToken(): Promise<{ token?: string | null }>;
}

export type TokenClientFactory = (config: GrowthConfig) => TokenClient;

/** 本番用: 設定から google-auth-library の UserRefreshClient を生成する。 */
export const defaultTokenClientFactory: TokenClientFactory = (config) =>
  new UserRefreshClient(
    config.googleClientId,
    config.googleClientSecret,
    config.googleRefreshToken
  );

export async function getAccessToken(
  config: GrowthConfig,
  factory: TokenClientFactory = defaultTokenClientFactory
): Promise<string> {
  const client = factory(config);
  const { token } = await client.getAccessToken();

  if (!token) {
    throw new Error(
      "アクセストークンの取得に失敗しました。リフレッシュトークンが失効している可能性があります(OAuth 同意画面が本番公開されているか確認してください)。"
    );
  }

  return token;
}
