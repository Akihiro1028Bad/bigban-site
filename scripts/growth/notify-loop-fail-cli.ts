/**
 * loop/実行モードの失敗を LINE 通知する入口(#220 / P1⑥・run.mjs から起動)。
 *
 *   GROWTH_LOOP_MODE=revise \
 *   GROWTH_LOOP_RESUME="npm run growth:revise-loop" \
 *   GROWTH_LOOP_KIND=spawn-error|nonzero-exit \
 *   GROWTH_LOOP_EXIT=3 \
 *   GROWTH_LOOP_DETAIL="spawn claude ENOENT" \
 *   npm run growth:notify-loop-fail
 *
 * claude 起動失敗・非0 exit を weekly と同水準で通知する。本文は loopFailure.ts(テスト済み)。
 * ここは env → LINE push の薄い配線。LINE 未設定・送信失敗でも失敗そのものは握り潰さない。
 */

import "dotenv/config";

import { defaultFetch } from "./http";
import { pushTextMessage } from "./line";
import { buildLoopFailureMessage, type LoopFailureKind } from "./loopFailure";

async function main(): Promise<void> {
  const mode = process.env.GROWTH_LOOP_MODE ?? "(unknown)";
  const resumeCommand = process.env.GROWTH_LOOP_RESUME ?? "(再実行してください)";
  const kind: LoopFailureKind =
    process.env.GROWTH_LOOP_KIND === "spawn-error" ? "spawn-error" : "nonzero-exit";
  const exitRaw = Number(process.env.GROWTH_LOOP_EXIT);
  const exitCode = Number.isFinite(exitRaw) ? exitRaw : undefined;
  const detail = process.env.GROWTH_LOOP_DETAIL;

  const message = buildLoopFailureMessage({ mode, resumeCommand, kind, exitCode, detail });
  process.stderr.write(`${message}\n`);

  const to = process.env.LINE_GROUP_ID;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!to || !token) {
    process.stderr.write(
      "(LINE 未設定のため loop 失敗通知は送れません: LINE_GROUP_ID / LINE_CHANNEL_ACCESS_TOKEN)\n"
    );
    return;
  }

  try {
    await pushTextMessage(to, message, {
      channelAccessToken: token,
      fetchFn: defaultFetch,
      kind: "failure",
    });
    process.stderr.write("LINE グループへ loop 失敗を通知しました。\n");
  } catch (error: unknown) {
    const m = error instanceof Error ? error.message : String(error);
    process.stderr.write(`(loop 失敗の LINE 通知も送れませんでした: ${m})\n`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`loop 失敗通知に失敗しました: ${message}\n`);
  process.exitCode = 1;
});
