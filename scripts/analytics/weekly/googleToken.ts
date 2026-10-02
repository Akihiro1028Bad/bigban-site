import { z } from "zod";

const tokenSchema = z.object({ access_token: z.string().min(1) });

function required(env: Record<string, string | undefined>, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} が未設定です`);
  return value;
}

export async function fetchGoogleAccessToken(env: Record<string, string | undefined>): Promise<string> {
  const clientId = required(env, "GROWTH_GOOGLE_CLIENT_ID");
  const clientSecret = required(env, "GROWTH_GOOGLE_CLIENT_SECRET");
  const refreshToken = required(env, "GROWTH_GOOGLE_REFRESH_TOKEN");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    signal: AbortSignal.timeout(15_000),
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google OAuth 失敗: ${response.status}`);
  const parsed = tokenSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Google OAuth の応答に access_token がありません");
  return parsed.data.access_token;
}
