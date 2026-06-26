/**
 * React Query を使うコンポーネントのテスト用 render ヘルパ(#H7)。
 * テストごとに独立した QueryClient を作り、キャッシュ汚染を防ぐ。
 * 決定的に保つため retry/gcTime/staleTime を 0、画面フォーカス再取得を無効化する。
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export function renderWithClient(
  ui: ReactElement,
  options?: Omit<RenderOptions, "wrapper">
): RenderResult & { queryClient: QueryClient } {
  const queryClient = makeTestQueryClient();
  const result = render(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
    ...options,
  });
  return { ...result, queryClient };
}
