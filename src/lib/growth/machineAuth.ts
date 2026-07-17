import { safeEqual } from "@/lib/growth/apiAuth";

export type MachineTokenResult =
  | { ok: true }
  | { ok: false; status: 401 | 503; error: string };

const UNAUTHORIZED: MachineTokenResult = {
  ok: false,
  status: 401,
  error: "マシントークン認証に失敗しました",
};

const UNAVAILABLE: MachineTokenResult = {
  ok: false,
  status: 503,
  error: "サーバー側のトークンが未設定です",
};

/** PC専用Bearerを検証する。session Cookie・query parameterは認証手段として使わない。 */
export function verifyMachineToken(request: Request, expectedToken: string | undefined): MachineTokenResult {
  if (!expectedToken || expectedToken.trim().length < 32) return UNAVAILABLE;
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer ([^\s]+)$/);
  if (!match || !safeEqual(match[1], expectedToken)) return UNAUTHORIZED;
  return { ok: true };
}
