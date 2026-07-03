/**
 * 下書きプレビュー取得 API(Epic #72 / #74 / #95)。
 *
 * GET ?pageId=<NotionページID>: Notion 行に保存された本文HTMLミラー(#95 `下書き本文HTML`)
 * を読み、承認画面の詳細パネルがプレビュー描画するための本文を返す。
 *
 * #95: 無料プラン=APIキー1本・公開キーの下書き取得オフ方針のため、microCMS の下書きは
 * 読まず、publish-draft が Notion に保存した本文ミラーを NOTION_TOKEN で読む。
 *
 * - ミラー未保存(本文HTML 無し)→ exists:false(エラーにしない)
 * - Notion 取得失敗 → 502(沈黙させない)
 * - 認可は承認 API と同じ(`APPROVE_AUTH_ENABLED` で gate。既定ON・フェイルセーフ(未設定=ON))
 */

import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { adviceViewOf } from "@/lib/growth/advise";
import { applyViewOf } from "@/lib/growth/adviseApply";
import {
  draftBodyOf,
  eyecatchUrlOf,
  ideaTitleOf,
  isNotionPageId,
} from "@/lib/growth/approve";
import { bodyCommentViewOf } from "@/lib/growth/bodyComment";
import { bodyRegenViewOf } from "@/lib/growth/bodyImageRegen";
import { decorateViewOf } from "@/lib/growth/decorate";
import { regenViewOf } from "@/lib/growth/eyecatchRegen";
import { defaultFetch, getPage } from "@/lib/growth/notion";
import { getNewsSlugs } from "@/lib/microcms/queries";

export const runtime = "nodejs";

function badRequest(message: string): Response {
  return NextResponse.json({ success: false, error: message }, { status: 400 });
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  if (!token) return null;
  return { token, fetchFn: defaultFetch };
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!verifyToken(request)) return unauthorized();

  const pageId = url.searchParams.get("pageId");
  if (!isNotionPageId(pageId)) return badRequest("不正な pageId です。");

  const options = notionOptions();
  if (!options) {
    return NextResponse.json(
      { success: false, error: "サーバー設定エラー" },
      { status: 500 }
    );
  }

  try {
    const page = await getPage(pageId, options);
    const bodyHtml = draftBodyOf(page);
    if (!bodyHtml) {
      // まだ本文ミラーが保存されていない(下書きモード未実行 / 旧記事)。
      return NextResponse.json({ success: true, exists: false, draft: null });
    }
    // #H19: 壊れ内部リンク検査用に公開記事の slug 一覧を取得する(公開リスト=ドラフトではない#95対象外)。
    // 取得不可(未設定/障害)でも本文表示は止めない。未設定なら承認画面は壊れリンク検査をスキップする。
    let knownNewsPaths: string[] | undefined;
    try {
      knownNewsPaths = (await getNewsSlugs())
        .filter((s) => s.locale === "ja")
        .map((s) => `/ja/news/${s.slug}`);
    } catch {
      knownNewsPaths = undefined;
    }
    // #95: 本文ミラーは常に html モード。NewsBodyRenderer(#75)が bodyHtml をそのまま使う。
    return NextResponse.json({
      success: true,
      exists: true,
      draft: {
        title: ideaTitleOf(page),
        displayMode: "html",
        bodyHtml,
        body: "",
        // #H19: 既知の公開記事リンクパス(壊れ内部リンク検査用・取得不可なら未設定)。
        knownNewsPaths,
        // #141: アイキャッチURLミラー(未設定は空文字)。プレビューが画像表示に使う。
        eyecatch: eyecatchUrlOf(page),
        // #146: スタイリング・アドバイスの表示用ビュー(ステータス＋提示中のみ解析済みアドバイス)。
        advice: adviceViewOf(page),
        // #165: アドバイス採用→反映の表示用ビュー(ステータス＋提示中のみ before/after 案)。
        adviceApply: applyViewOf(page),
        // #147: 装飾提案の表示用ビュー(ステータス＋提示中のみ解析済み提案配列)。
        decorate: decorateViewOf(page),
        // #166: AI再生成の依頼中/処理中を承認画面で表示するためのビュー。
        // 本文画像は対象src付き(どの画像か)、アイキャッチはステータスのみ。
        bodyRegen: bodyRegenViewOf(page),
        eyecatchRegen: regenViewOf(page),
        // #182: 本文インラインコメントの表示用ビュー(ステータス＋投稿済みコメント)。
        bodyComment: bodyCommentViewOf(page),
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: "取得中にエラーが発生しました" },
      { status: 502 }
    );
  }
}
