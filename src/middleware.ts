import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

const handleI18nRouting = createMiddleware(routing);

const MAINTENANCE_BYPASS_PATHS = ["/teaser", "/_next", "/logos", "/images"];

function isMaintenanceBypassPath(pathname: string): boolean {
  return MAINTENANCE_BYPASS_PATHS.some((p) => pathname.startsWith(p));
}

function createMaintenanceResponse(request: NextRequest): NextResponse {
  // teaserは日本語固定のメンテナンスページ。locale検出は不要
  const url = new URL("/ja/teaser", request.url);
  return NextResponse.rewrite(url);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isMaintenance = process.env.NEXT_PUBLIC_MAINTENANCE === "true";

  if (isMaintenance) {
    if (isMaintenanceBypassPath(pathname)) {
      return handleI18nRouting(request);
    }
    return createMaintenanceResponse(request);
  }

  return handleI18nRouting(request);
}

export const config = {
  // locale 非依存のルートは i18n ルーティング対象外にする:
  //   - growth       … 管理ページ(/growth/approve)
  //   - draft-frame  … 下書きライブプレビュー iframe(route group (growth-preview)・URL=/draft-frame, #102)
  // どちらも app 直下(=[locale] 配下ではない)ため、ここで除外しないと /ja/... へ
  // 書き換えられて 404 になる。(growth-preview) 配下にルートを増やす場合も同様に追記すること。
  matcher: [
    "/((?!api|growth|draft-frame|_next/static|_next/image|favicon.ico|images|logos|.*\\..*).*)",
  ],
};
