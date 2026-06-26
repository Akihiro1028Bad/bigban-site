/**
 * 承認画面の React Query Provider(#H7)。
 *
 * 内部運用ツールのため、サーバ状態は「常に新鮮・自動リトライしない」方針:
 * retry:false / staleTime:0 / refetchOnWindowFocus:false。ポーリングは各 useQuery の
 * refetchInterval(条件関数)で表現する。Next App Router の公式パターンに従い、
 * server では毎回新規・browser ではシングルトンの QueryClient を使う。
 */

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        staleTime: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  if (typeof window === "undefined") {
    // Server: リクエストごとに新規(状態を共有しない)。
    return makeQueryClient();
  }
  // Browser: 1つを使い回す(Suspense 再レンダーでも作り直さない)。
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function ApproveProviders({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
