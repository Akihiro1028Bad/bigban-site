/**
 * MSW 既定ハンドラ(#H7 テスト基盤)。
 * 既定は空。各テストが `server.use(http.get(...))` で必要なハンドラを足す。
 */

import type { RequestHandler } from "msw";

export const handlers: RequestHandler[] = [];
