/**
 * 下書き本文の保存 API(Epic #72 / #76)。
 *
 * POST { pageId, bodyHtml }: リッチエディタ(#77)で編集した本文を microCMS 下書きへ保存する。
 * **サーバ側で必ず再サニタイズ**(STRICT_HTML_CONFIG)してから書き込む(XSS 防御の最終段)。
 *
 * - 書き込みは **単一APIキー**(MICROCMS_API_KEY)で `patchDraft`(同じ単一APIキーを使用)。
 * - status=draft の PATCH のみ。公開はしない。
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。既定ON・フェイルセーフ(未設定=ON))。
 */

import { after, NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { draftBodyOf, draftLinkOf, ideaTitleOf, isNotionPageId, mediaOf } from "@/lib/growth/approve";
import { BODY_REGEN_BUSY_STATUSES, bodyRegenRowFromPage } from "@/lib/growth/bodyImageRegen";
import { patchDraft } from "@/lib/growth/content";
import { growthEndpoint } from "@/lib/growth/endpoint";
import {
  AdoptedFixDetailSchema,
  appendLearningLog,
  formatAdoptedFixSummary,
  formatEditDiffSummary,
  summarizeEditDiff,
  type AdoptedFixDetail,
} from "@/lib/growth/learningLog";
import {
  buildBodyMirrorProps,
  createPage,
  defaultFetch,
  getPage,
  updatePageProps,
} from "@/lib/growth/notion";
import { evaluateRegate } from "@/lib/growth/publishGate";
import { articleEditGuard } from "@/lib/growth/stageGuard";
import { sanitizeNewsHtml, STRICT_HTML_CONFIG } from "@/lib/news/sanitize";

export const runtime = "nodejs";

// microCMS contentId の許可文字(slugToContentId と同じ)。不正値を URL パスに載せない。
const CONTENT_ID_RE = /^[a-z0-9-]+$/;
// 本文HTMLの上限(記事本文として十分・過大入力を境界で弾く)。
const MAX_BODY_HTML = 500_000;
// 学習ログに残す採用 fix / 観点の上限(既存 adoptedAspects の .slice(0,20) に合わせる)。
const MAX_ADOPTED = 20;
// adoptedFixes(採用 fix の詳細)を境界で検証する(上限 MAX_ADOPTED)。
const AdoptedFixesSchema = AdoptedFixDetailSchema.array().max(MAX_ADOPTED);

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function serverError(): Response {
  return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

function microcmsOptions(): { serviceDomain: string; apiKey: string; fetchFn: typeof defaultFetch } | null {
  const serviceDomain = process.env.MICROCMS_SERVICE_DOMAIN;
  // 書き込みは 単一APIキーのみ(同じ単一APIキーを使用=#76)。
  const apiKey = process.env.MICROCMS_API_KEY;
  if (!serviceDomain || !apiKey) return null;
  return { serviceDomain, apiKey, fetchFn: defaultFetch };
}

export async function POST(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("不正なリクエストです。");
  }
  const pageId = (body as { pageId?: unknown })?.pageId;
  const bodyHtml = (body as { bodyHtml?: unknown })?.bodyHtml;
  const source = (body as { source?: unknown })?.source;
  const rawAspects = (body as { adoptedAspects?: unknown })?.adoptedAspects;
  const rawFixes = (body as { adoptedFixes?: unknown })?.adoptedFixes;
  const isAdopt = source === "advise-apply" || source === "comment-revise";
  const adoptedAspects: string[] = Array.isArray(rawAspects)
    ? rawAspects.filter((aspect): aspect is string => typeof aspect === "string").slice(0, 20)
    : [];
  // adoptedFixes は省略可能。壊れた形は空配列(→ adoptedAspects 挙動へフォールバック=後方互換)。
  const adoptedFixesParsed = AdoptedFixesSchema.safeParse(rawFixes);
  const adoptedFixes: AdoptedFixDetail[] = adoptedFixesParsed.success ? adoptedFixesParsed.data : [];
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");
  if (typeof bodyHtml !== "string" || bodyHtml.trim() === "") {
    return badRequest("本文が空です。");
  }
  if (bodyHtml.length > MAX_BODY_HTML) {
    return badRequest("本文が大きすぎます。");
  }

  const notionOpts = notionOptions();
  const microOpts = microcmsOptions();
  if (!notionOpts || !microOpts) return serverError();

  let contentId: string;
  // #176: 承認画面の正タイトル(Notion タイトル案)を microCMS 下書きにも同期し、
  // 承認画面と公開記事のタイトル不一致を防ぐ。空なら送らない(本文だけ更新)。
  let title = "";
  // #C3: microCMS 同期失敗時にミラーを戻すための旧本文(ロールバック用)。
  let previousBody = "";
  // #H9: 生成中・公開済みの記事は本文編集を弾く(getPage 失敗とは別経路で 409 を返す)。
  let stageBlocked: Response | null = null;
  let endpoint = growthEndpoint();
  try {
    const page = await getPage(pageId, notionOpts);
    if (BODY_REGEN_BUSY_STATUSES.includes(bodyRegenRowFromPage(page).status)) {
      return NextResponse.json(
        { success: false, error: "画像生成の処理中です。完了後にもう一度保存してください。" },
        { status: 409 }
      );
    }
    stageBlocked = articleEditGuard(page);
    contentId = draftLinkOf(page).contentId;
    title = ideaTitleOf(page).trim();
    previousBody = draftBodyOf(page);
    endpoint = growthEndpoint(mediaOf(page));
  } catch {
    return NextResponse.json(
      { success: false, error: "保存中にエラーが発生しました" },
      { status: 502 }
    );
  }
  if (stageBlocked) return stageBlocked;
  if (!contentId || !CONTENT_ID_RE.test(contentId)) {
    return NextResponse.json(
      { success: false, error: "編集対象の下書きが見つかりません。" },
      { status: 404 }
    );
  }

  // サーバ側で再サニタイズ(許可外タグ/属性を除去)してから書き込む(XSS 最終段)。
  const sanitized = sanitizeNewsHtml(bodyHtml, STRICT_HTML_CONFIG);

  if (isAdopt) {
    const regate = evaluateRegate({ before: previousBody, after: sanitized, title });
    if (!regate.ok) {
      return NextResponse.json(
        {
          success: false,
          error: `公開前チェックで新しい問題が見つかりました: ${regate.newBlocks.join(" / ")}`,
        },
        { status: 409 }
      );
    }
  }

  // #95: (1)プレビュー正本=Notion ミラーを先に更新 → (2)公開ターゲット=microCMS 下書きへ同期。
  // どちらが失敗したかを明示し(再保存で両者を冪等に上書きできる)、沈黙させない。
  try {
    await updatePageProps(pageId, buildBodyMirrorProps(sanitized), notionOpts);
  } catch {
    return NextResponse.json(
      { success: false, error: "プレビューへの反映(Notion)に失敗しました。再保存してください。" },
      { status: 502 }
    );
  }
  try {
    await patchDraft(
      endpoint,
      contentId,
      { ...(title ? { title } : {}), bodyHtml: sanitized },
      microOpts
    );
  } catch {
    // #C3: microCMS 同期に失敗 → Notion ミラーを旧本文へ戻し、ミラー(プレビュー正本)が
    // 公開ターゲット(microCMS)より先行=「見せた本文≠公開する本文」になるのを防ぐ。
    // ロールバックも失敗した場合は先行状態が残るが、再保存で冪等に回復する(沈黙させず 502)。
    try {
      await updatePageProps(pageId, buildBodyMirrorProps(previousBody), notionOpts);
    } catch {
      /* rollback 失敗。再保存で回復する。 */
    }
    return NextResponse.json(
      { success: false, error: "公開ターゲット(microCMS)への同期に失敗しました。再保存してください。" },
      { status: 502 }
    );
  }

  // #SI1: 本文更新の学習ログをベストエフォート追記(after=レスポンス後実行)。
  // 本処理(保存)の成否には一切影響させない。
  const learningLogDs = process.env.GROWTH_LEARNING_LOG_DS;
  if (learningLogDs) {
    if (isAdopt && adoptedFixes.length > 0) {
      // #SI1(b'): 採用 fix の詳細(指摘・変更前後)を fix ごとに 1 行「採否」で残す。
      // adoptedAspects(観点文字列のみ)より優先=fix の中身が学習ログに残る。
      after(async () => {
        for (const fix of adoptedFixes) {
          const outcome = await appendLearningLog(
            {
              kind: "採否",
              pageId,
              title,
              aspect: fix.aspect,
              before: fix.before,
              after: fix.after,
            },
            {
              dataSourceId: learningLogDs,
              notionOptions: notionOpts,
              createPageFn: createPage,
              nowIso: new Date().toISOString(),
              diffSummary: formatAdoptedFixSummary(fix),
            }
          );
          if (outcome.status === "failed") {
            console.error("learning-log append failed (adopt-fix)", outcome.error);
          }
        }
      });
    } else if (isAdopt && adoptedAspects.length > 0) {
      // #SI1(b): 採用観点ごとに 1 行「採否」を追記(adoptedFixes 未送信時の後方互換)。
      after(async () => {
        for (const aspect of adoptedAspects) {
          const outcome = await appendLearningLog(
            { kind: "採否", pageId, title, aspect, before: previousBody, after: sanitized },
            {
              dataSourceId: learningLogDs,
              notionOptions: notionOpts,
              createPageFn: createPage,
              nowIso: new Date().toISOString(),
              diffSummary: `採用観点: ${aspect}`,
            }
          );
          if (outcome.status === "failed") {
            console.error("learning-log append failed (adopt)", outcome.error);
          }
        }
      });
    } else {
      // #SI1(a): 手動編集(source なし)は「編集」を 1 行。無変更はスキップ。
      const editDiff = summarizeEditDiff(previousBody, sanitized);
      if (!editDiff.noChange) {
        after(async () => {
          const outcome = await appendLearningLog(
            { kind: "編集", pageId, title, before: previousBody, after: sanitized },
            {
              dataSourceId: learningLogDs,
              notionOptions: notionOpts,
              createPageFn: createPage,
              nowIso: new Date().toISOString(),
              diffSummary: formatEditDiffSummary(editDiff),
              titleHeadline: editDiff.headline,
            }
          );
          if (outcome.status === "failed") {
            console.error("learning-log append failed (draft/edit)", outcome.error);
          }
        });
      }
    }
  }

  return NextResponse.json({ success: true });
}
