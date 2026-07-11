// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { UserRefreshClient } from "google-auth-library";

import {
  getAccessToken,
  defaultTokenClientFactory,
  type TokenClientFactory,
} from "./auth";
import type { GrowthConfig } from "./config";

const config: GrowthConfig = {
  ga4PropertyId: "540956661",
  gscSiteUrl: "https://www.thepicklebang.com/",
  googleClientId: "client-id",
  googleClientSecret: "client-secret",
  googleRefreshToken: "refresh-token",
};

describe("getAccessToken", () => {
  it("リフレッシュトークンからアクセストークンを取得する", async () => {
    const factory: TokenClientFactory = () => ({
      getAccessToken: vi.fn().mockResolvedValue({ token: "ya29.access-token" }),
    });

    await expect(getAccessToken(config, factory)).resolves.toBe(
      "ya29.access-token"
    );
  });

  it("生成したクライアントに設定の認証情報を渡す", async () => {
    const received: GrowthConfig[] = [];
    const factory: TokenClientFactory = (c) => {
      received.push(c);
      return {
        getAccessToken: vi.fn().mockResolvedValue({ token: "t" }),
      };
    };

    await getAccessToken(config, factory);
    expect(received[0]).toBe(config);
  });

  it("factory 省略時はデフォルト(UserRefreshClient)を用いる", async () => {
    const spy = vi
      .spyOn(UserRefreshClient.prototype, "getAccessToken")
      // getAccessToken はコールバック版オーバーロードを持ち型推論が void になるため、
      // テスト用に解決値をキャストする。
      .mockResolvedValue({ token: "default-token" } as never);

    await expect(getAccessToken(config)).resolves.toBe("default-token");
    spy.mockRestore();
  });

  it("トークンが空の場合はエラーを投げる", async () => {
    const factory: TokenClientFactory = () => ({
      getAccessToken: vi.fn().mockResolvedValue({ token: null }),
    });

    await expect(getAccessToken(config, factory)).rejects.toThrow(
      /アクセストークン/
    );
  });
});

describe("defaultTokenClientFactory", () => {
  it("設定から UserRefreshClient を生成する", () => {
    const client = defaultTokenClientFactory(config);
    expect(client).toBeInstanceOf(UserRefreshClient);
  });
});
