import { createHmac, timingSafeEqual } from "node:crypto";

import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const webhookSchema = z.object({
  service: z.string().optional(),
  api: z.string(),
  id: z.string().optional(),
  type: z.string().optional(),
});

function safeEqualHex(a: string, b: string): boolean {
  /* istanbul ignore next -- @preserve HMAC は固定長 64 字なので length 不一致は実運用で到達困難 */
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.MICROCMS_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "server_misconfigured" },
      { status: 500 },
    );
  }

  const sig = request.headers.get("x-microcms-signature");
  const rawBody = await request.text();

  if (!sig) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  const expected = createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  if (!safeEqualHex(sig, expected)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 },
    );
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = webhookSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_body" },
      { status: 400 },
    );
  }

  const api = parsed.data.api;
  // 許可リスト外 (news / columns / column-categories 以外) はスキップ。
  if (api !== "news" && api !== "columns" && api !== "column-categories") {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Next.js 16 の revalidateTag(tag, profile) は profile を必須で要求する。
  // Webhook 起点で即時無効化を担保するため { expire: 0 } を指定する。
  // "default" / "max" は stale-while-revalidate 系の挙動に解釈されうるため
  // 採用しない。
  // https://nextjs.org/docs/app/api-reference/functions/revalidateTag
  const tags: string[] = [];

  function expire(tag: string): void {
    revalidateTag(tag, { expire: 0 });
    tags.push(tag);
  }

  if (api === "column-categories") {
    // カテゴリマスタの更新は自タグに加え、名/色を焼き込む一覧側 (columns) も
    // 連鎖 expire する (§5.3)。id 別 (columns-{id}) は無関係なので触らない。
    expire("column-categories");
    expire("columns");
  } else {
    // news / columns: 全体タグ + (id があれば) 記事別タグを即時無効化する。
    expire(api);
    if (parsed.data.id) {
      expire(`${api}-${parsed.data.id}-ja`);
      expire(`${api}-${parsed.data.id}-en`);
    }
  }

  // タグ依存が Full Route Cache に記録されていないページ
  // (Suspense 境界内で fetch しているトップページ HomeNews 等) でも
  // 確実に再生成するため、root layout レベルで path invalidation を発火する。
  // "layout" 指定で / 配下 (ja/en 両方含む) すべてのルートが再生成対象になる。
  revalidatePath("/", "layout");

  return NextResponse.json({ ok: true, revalidated: tags, paths: ["/"] });
}
