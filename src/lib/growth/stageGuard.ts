/**
 * 段階ガード(#H9)。生成中・公開済みの記事への編集/AI依頼を一元的に弾く。
 *
 * 背景: 編集系/AI依頼系 API が個別に「どの段階なら触っていいか」を判断していなかったため、
 * 生成中(下書き書込が競合)・公開済み(確定)に対しても処理を受け付けてしまう余地があった。
 * ここに集約し、各ルートは `getPage` 直後に 1 行で呼ぶ。
 */

import { NextResponse } from "next/server";

import { articleStageOf } from "./approve";
import type { NotionPage } from "./notion";
import { isArticleStageEditable } from "./stage";

// 弾く段階(EDIT_BLOCKED_STAGES = generating/published)の表示ラベル。
// isArticleStageEditable() が false を返すのはこの2段階のみなので、ここを通る stage は必ずキーを持つ。
const BLOCKED_STAGE_LABEL = {
  generating: "生成中",
  published: "公開済み",
} as const;

/**
 * 編集/AI依頼を弾くべき段階なら 409 Response を、許可されるなら null を返す。
 * 各ルートで `const blocked = articleEditGuard(page); if (blocked) return blocked;` と使う。
 */
export function articleEditGuard(page: NotionPage): Response | null {
  const stage = articleStageOf(page);
  if (isArticleStageEditable(stage)) return null;
  const label = BLOCKED_STAGE_LABEL[stage as keyof typeof BLOCKED_STAGE_LABEL];
  return NextResponse.json(
    { success: false, error: `この記事は${label}のため、編集・AI依頼を受け付けられません。` },
    { status: 409 }
  );
}
