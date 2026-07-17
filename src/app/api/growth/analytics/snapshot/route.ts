import { NextResponse } from "next/server";

import { getLatestSnapshot, resolveSnapshotStore } from "@/lib/growth/analyticsBlob";
import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { verifyMachineToken } from "@/lib/growth/machineAuth";
import { snapshotSchema } from "@/lib/growth/snapshotSchema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SNAPSHOT_BYTES = 5 * 1024 * 1024;

function errorResponse(status: number, error: string): Response {
  return NextResponse.json({ success: false, error }, { status });
}

/**
 * PC取り込み専用の受け口。
 * 既存authRateLimitは承認画面の合言葉とsession署名キーに結び付くため、
 * 独立マシントークンを扱うこのrouteには適用しない。
 */
export async function POST(request: Request): Promise<Response> {
  const auth = verifyMachineToken(request, process.env.GROWTH_ANALYTICS_INGEST_TOKEN);
  if (!auth.ok) return errorResponse(auth.status, auth.error);

  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return errorResponse(400, "スナップショットの読取に失敗しました");
  }
  if (bytes.byteLength > MAX_SNAPSHOT_BYTES) return errorResponse(413, "スナップショットのサイズが上限を超えています");

  let json: string;
  let snapshot: ReturnType<typeof snapshotSchema.parse>;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    snapshot = snapshotSchema.parse(JSON.parse(json));
  } catch {
    return errorResponse(400, "スナップショットの形式が不正です");
  }

  try {
    await resolveSnapshotStore({
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
      GROWTH_ANALYTICS_FILE_DIR: process.env.GROWTH_ANALYTICS_FILE_DIR,
      GROWTH_RESERVATION_DATA_DIR: process.env.GROWTH_RESERVATION_DATA_DIR,
    // parse済みの値だけを永続化し、未知フィールドをそのままBlobへ渡さない。
    }).putLatest(JSON.stringify(snapshot), snapshot.analysis.referenceYmd);
  } catch {
    return errorResponse(502, "スナップショットの保存に失敗しました");
  }
  return NextResponse.json({ success: true }, { status: 202 });
}

/** 承認画面のセッション内だけで最新の集計済みスナップショットを返す。 */
export async function GET(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  try {
    const json = await getLatestSnapshot(resolveSnapshotStore({
      BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
      GROWTH_ANALYTICS_FILE_DIR: process.env.GROWTH_ANALYTICS_FILE_DIR,
      GROWTH_RESERVATION_DATA_DIR: process.env.GROWTH_RESERVATION_DATA_DIR,
    }));
    if (json === null) return NextResponse.json({ success: true, snapshot: null });

    let snapshot: ReturnType<typeof snapshotSchema.parse>;
    try {
      snapshot = snapshotSchema.parse(JSON.parse(json));
    } catch {
      return errorResponse(500, "保存済みスナップショットの形式が不正です");
    }
    return NextResponse.json({ success: true, snapshot });
  } catch {
    return errorResponse(500, "スナップショットの取得に失敗しました");
  }
}
