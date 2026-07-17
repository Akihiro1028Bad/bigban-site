import { describe, expect, it } from "vitest";

import { verifyMachineToken } from "./machineAuth";

const TOKEN = "0123456789abcdef0123456789abcdef";

function request(headers?: HeadersInit, suffix = ""): Request {
  return new Request(`https://example.test/api/growth/analytics/snapshot${suffix}`, { headers });
}

describe("verifyMachineToken", () => {
  it("一致する Bearer トークンだけを受理する", () => {
    expect(verifyMachineToken(request({ Authorization: `Bearer ${TOKEN}` }), TOKEN)).toEqual({ ok: true });
  });

  it("Authorization が欠落している場合は拒否する", () => {
    expect(verifyMachineToken(request(), TOKEN)).toEqual({ ok: false, status: 401, error: "マシントークン認証に失敗しました" });
  });

  it("一致しない Bearer トークンを拒否する", () => {
    expect(verifyMachineToken(request({ Authorization: "Bearer different" }), TOKEN)).toEqual({ ok: false, status: 401, error: "マシントークン認証に失敗しました" });
  });

  it("サーバー側トークンが未設定なら受け口を無効化する", () => {
    expect(verifyMachineToken(request({ Authorization: `Bearer ${TOKEN}` }), undefined)).toEqual({ ok: false, status: 503, error: "サーバー側のトークンが未設定です" });
  });

  it("短いサーバー側トークンなら受け口を無効化する", () => {
    expect(verifyMachineToken(request({ Authorization: `Bearer ${TOKEN}` }), "too-short")).toEqual({ ok: false, status: 503, error: "サーバー側のトークンが未設定です" });
  });

  it("Cookie と query token をマシン認証として受理しない", () => {
    expect(verifyMachineToken(request({ cookie: `token=${TOKEN}` }, `?token=${TOKEN}`), TOKEN)).toEqual({ ok: false, status: 401, error: "マシントークン認証に失敗しました" });
  });
});
