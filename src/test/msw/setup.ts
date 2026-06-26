/**
 * MSW を「使うテストファイルだけ」で起動する opt-in ヘルパ(#H7)。
 *
 * グローバル起動は、モジュール冒頭で `globalThis.fetch = vi.fn()` を代入する既存テスト
 * （例: EmailSignup）と干渉する（MSW が当該 mock を passthrough 先に取り込み、呼び出し
 * シグネチャが Request に変わる）。そのため全体には載せず、React Query を使うテストが
 * トップレベルで `useMswServer()` を呼んで自分のスイートにだけ lifecycle を登録する。
 */

import { afterAll, afterEach, beforeAll } from "vitest";

import { server } from "./server";

/** 呼び出したテストファイルのスイートに MSW の listen/reset/close を登録する。 */
export function setupMswServer(): void {
  beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
}
