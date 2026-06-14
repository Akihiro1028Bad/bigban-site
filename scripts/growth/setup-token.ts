/**
 * 一度きりの OAuth 同意フローを実行し、リフレッシュトークンを取得する入口。
 *
 *   npm run growth:setup-token [path/to/oauth-client.json]
 *
 * ブラウザが開くのでオーナーの Google アカウント(GA4/GSC の所有者)で許可する。
 * 取得した値を .env の GROWTH_GOOGLE_* に貼り付ける。
 * 薄い実行スクリプトのためテスト対象外。
 */

import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { authenticate } from "@google-cloud/local-auth";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

interface OAuthClientFile {
  installed?: { client_id?: string; client_secret?: string };
  web?: { client_id?: string; client_secret?: string };
}

async function main(): Promise<void> {
  const keyfilePath = path.resolve(
    process.cwd(),
    process.argv[2] ??
      process.env.GROWTH_OAUTH_KEYFILE ??
      "secrets/google-oauth-client.json"
  );

  const raw = await readFile(keyfilePath, "utf-8");
  const parsed = JSON.parse(raw) as OAuthClientFile;
  const creds = parsed.installed ?? parsed.web ?? {};

  const client = await authenticate({ scopes: SCOPES, keyfilePath });
  const refreshToken = client.credentials.refresh_token;

  if (!refreshToken) {
    process.stderr.write(
      "リフレッシュトークンが取得できませんでした。\n" +
        "既に同意済みの可能性があります。Google アカウントの「サードパーティ アクセス」から\n" +
        "当該アプリのアクセスを削除してから、もう一度実行してください。\n"
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    "\n取得成功。以下を .env に設定してください:\n\n" +
      `GROWTH_GOOGLE_CLIENT_ID=${creds.client_id ?? ""}\n` +
      `GROWTH_GOOGLE_CLIENT_SECRET=${creds.client_secret ?? ""}\n` +
      `GROWTH_GOOGLE_REFRESH_TOKEN=${refreshToken}\n\n`
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`トークン取得に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
