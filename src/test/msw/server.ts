/**
 * MSW テスト用サーバ(#H7)。CLAUDE.md「never mock fetch/axios directly」に準拠し、
 * fetch を直接スタブする代わりにネットワーク層でモックする。
 * lifecycle(listen/resetHandlers/close)は vitest.setup.ts で結線する。
 */

import { setupServer } from "msw/node";

import { handlers } from "./handlers";

export const server = setupServer(...handlers);
