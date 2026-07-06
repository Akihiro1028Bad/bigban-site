/**
 * ⚠️ このテストが守る mode/skip/成否判定は run.mjs の `pullLatestOrAbort()` のミラーである
 * (run.mjs は .ts を import できないための二重実装)。乖離させないこと:
 * gitPull.ts(特に PULL_SKIP_ENV_VARS)を変更したら run.mjs 側も必ず同時に更新する。
 */
import { describe, expect, it } from "vitest";

import {
  buildPullFailureMessage,
  classifyPullResult,
  formatShaLine,
  PULL_SKIP_ENV_VARS,
  shouldPullForMode,
  shouldSkipPull,
} from "./gitPull";

describe("PULL_SKIP_ENV_VARS(run.mjs とのミラー正典)", () => {
  it("skip 判定に使う env 名を正典として公開する(変更時は run.mjs も更新)", () => {
    expect(PULL_SKIP_ENV_VARS).toEqual(["GROWTH_DRYRUN", "GROWTH_SKIP_PULL"]);
  });
});

describe("shouldSkipPull", () => {
  it("GROWTH_DRYRUN 指定時は pull を skip する(動作確認を壊さない)", () => {
    expect(shouldSkipPull({ GROWTH_DRYRUN: "1" })).toBe(true);
  });

  it("GROWTH_SKIP_PULL 指定時も skip する(明示 opt-out)", () => {
    expect(shouldSkipPull({ GROWTH_SKIP_PULL: "1" })).toBe(true);
  });

  it("いずれも無指定なら pull を実行する", () => {
    expect(shouldSkipPull({})).toBe(false);
  });

  it("空文字は未指定扱い(false)", () => {
    expect(shouldSkipPull({ GROWTH_DRYRUN: "", GROWTH_SKIP_PULL: "" })).toBe(false);
  });
});

describe("shouldPullForMode", () => {
  it("weekly かつ skip env 無しなら pull する", () => {
    expect(shouldPullForMode("weekly", {})).toBe(true);
  });

  it("weekly でも GROWTH_DRYRUN / GROWTH_SKIP_PULL があれば pull しない", () => {
    expect(shouldPullForMode("weekly", { GROWTH_DRYRUN: "1" })).toBe(false);
    expect(shouldPullForMode("weekly", { GROWTH_SKIP_PULL: "1" })).toBe(false);
  });

  it("weekly 以外のモードは env に関わらず pull しない", () => {
    expect(shouldPullForMode("drafts", {})).toBe(false);
    expect(shouldPullForMode("revise", {})).toBe(false);
    expect(shouldPullForMode("regen", { GROWTH_SKIP_PULL: "1" })).toBe(false);
  });
});

describe("classifyPullResult", () => {
  it("exitCode 0 は成功", () => {
    expect(classifyPullResult(0)).toEqual({ ok: true });
  });

  it("非 0 exit は失敗(ff-only 不可・conflict・ネットワーク断など)", () => {
    expect(classifyPullResult(1)).toEqual({ ok: false });
    expect(classifyPullResult(128)).toEqual({ ok: false });
  });

  it("null(異常終了・シグナル)は失敗扱い", () => {
    expect(classifyPullResult(null)).toEqual({ ok: false });
  });
});

describe("buildPullFailureMessage", () => {
  it("工程名・再開コマンド・原因ヒントを含む(失敗を沈黙させない)", () => {
    const msg = buildPullFailureMessage({
      mode: "drafts",
      branch: "feature/x",
      resumeCommand: "npm run growth:drafts",
    });
    expect(msg).toContain("drafts");
    expect(msg).toContain("git pull --ff-only");
    expect(msg).toContain("feature/x");
    expect(msg).toContain("npm run growth:drafts");
  });

  it("stderr 抜粋があれば末尾に載せる(原因特定の手掛かり)", () => {
    const msg = buildPullFailureMessage({
      mode: "revise",
      branch: "develop",
      resumeCommand: "npm run growth:revise-loop",
      detail: "fatal: Not possible to fast-forward, aborting.",
    });
    expect(msg).toContain("Not possible to fast-forward");
  });

  it("detail が空なら detail 行を出さない", () => {
    const msg = buildPullFailureMessage({
      mode: "weekly",
      branch: "develop",
      resumeCommand: "npm run growth:weekly",
      detail: "   ",
    });
    expect(msg).not.toContain("詳細:");
  });
});

describe("formatShaLine", () => {
  it("短縮 SHA を含む行を返す(デプロイ側とのスキュー確認用)", () => {
    expect(formatShaLine("a1b2c3d")).toBe("実行 SHA: a1b2c3d");
  });

  it("空 SHA(取得失敗)なら unknown を出す", () => {
    expect(formatShaLine("")).toBe("実行 SHA: (取得できませんでした)");
    expect(formatShaLine("  ")).toBe("実行 SHA: (取得できませんでした)");
  });
});
