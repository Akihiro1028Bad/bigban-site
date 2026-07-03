/**
 * 実行前 git pull 失敗の LINE 通知入口(#219 / P1⑤・run.mjs から起動)。
 *
 *   GROWTH_PULL_MODE=drafts \
 *   GROWTH_PULL_BRANCH=develop \
 *   GROWTH_PULL_RESUME="npm run growth:drafts" \
 *   GROWTH_PULL_DETAIL="fatal: Not possible to fast-forward" \
 *   npm run growth:notify-pull-fail
 *
 * run.mjs は pull 失敗時にこの CLI を起動して「工程中断」を沈黙させない。
 * 本文の組み立ては gitPull.ts(テスト済み)。ここは env → LINE push の薄い配線。
 * LINE 未設定・送信失敗でも exit≠0 は維持し、失敗そのものは握り潰さない。
 */

import "dotenv/config";

import { buildPullFailureMessage } from "./gitPull";
import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";

async function main(): Promise<void> {
  const mode = process.env.GROWTH_PULL_MODE ?? "(unknown)";
  const branch = process.env.GROWTH_PULL_BRANCH ?? "(unknown)";
  const resumeCommand = process.env.GROWTH_PULL_RESUME ?? "(再実行してください)";
  const detail = process.env.GROWTH_PULL_DETAIL;

  const message = buildPullFailureMessage({ mode, branch, resumeCommand, detail });
  process.stderr.write(`${message}\n`);

  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) {
    process.stderr.write(
      "(LINE 未設定のため pull 失敗通知は送れません: LINE_GROUP_ID / LINE_CHANNEL_ACCESS_TOKEN)\n"
    );
    return;
  }

  try {
    await pushTextMessage(to, message, { channelAccessToken: token, fetchFn: defaultFetch });
    process.stderr.write("LINE グループへ pull 失敗を通知しました。\n");
  } catch (error: unknown) {
    const m = error instanceof Error ? error.message : String(error);
    process.stderr.write(`(pull 失敗の LINE 通知も送れませんでした: ${m})\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`pull 失敗通知に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
