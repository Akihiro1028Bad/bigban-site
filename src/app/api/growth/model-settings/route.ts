import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import {
  MODEL_CATALOG,
  MODEL_SETTING_PROPS,
  MODEL_SETTINGS_DS,
  PROVIDER_EFFORTS,
  buildModelSettingProps,
  mergeModelSettings,
  modelSettingFromPage,
  parseModelSettingInput,
} from "@/lib/growth/modelSettings";
import {
  createPage,
  defaultFetch,
  updatePageProps,
} from "@/lib/growth/notion";
import { queryAllDataSource, queryFirstDataSource } from "@/lib/growth/notionRepository";

export const runtime = "nodejs";

function dataSourceId(): string {
  return process.env.GROWTH_MODEL_SETTINGS_DS || MODEL_SETTINGS_DS;
}

function notionOptions(): { token: string; fetchFn: typeof defaultFetch } | null {
  const token = process.env.NOTION_TOKEN;
  return token ? { token, fetchFn: defaultFetch } : null;
}

function serverError(): Response {
  return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
}

function fallbackResponse(): Response {
  return NextResponse.json({
    success: true,
    storageAvailable: false,
    warning: "NotionのAIモデル設定DBを読み込めないため、推奨値を表示しています。",
    settings: mergeModelSettings([]),
    catalog: MODEL_CATALOG,
    efforts: PROVIDER_EFFORTS,
  });
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();
  const options = notionOptions();
  if (!options) return fallbackResponse();

  try {
    const pages = await queryAllDataSource(dataSourceId(), {}, options);
    const overrides = pages
      .map(modelSettingFromPage)
      .filter((setting) => setting !== null);
    return NextResponse.json({
      success: true,
      storageAvailable: true,
      warning: null,
      settings: mergeModelSettings(overrides),
      catalog: MODEL_CATALOG,
      efforts: PROVIDER_EFFORTS,
    });
  } catch {
    return fallbackResponse();
  }
}

export async function PUT(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();
  const options = notionOptions();
  if (!options) return serverError();

  let input;
  try {
    input = parseModelSettingInput(await request.json());
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "不正な設定です。";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  try {
    const existing = await queryFirstDataSource(
      dataSourceId(),
      {
        filter: {
          property: MODEL_SETTING_PROPS.phaseId,
          title: { equals: input.phaseId },
        },
      },
      options,
    );
    const props = buildModelSettingProps(input);
    if (existing) {
      await updatePageProps(existing.id, props, options);
    } else {
      await createPage(dataSourceId(), props, options);
    }
    const setting = mergeModelSettings([input]).find((item) => item.id === input.phaseId);
    return NextResponse.json({ success: true, setting });
  } catch {
    return NextResponse.json(
      { success: false, error: "AIモデル設定の保存中にエラーが発生しました" },
      { status: 502 },
    );
  }
}
