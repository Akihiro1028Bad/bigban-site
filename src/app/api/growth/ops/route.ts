import { NextResponse } from "next/server";

import { unauthorized, verifyToken } from "@/lib/growth/apiAuth";
import { defaultFetch } from "@/lib/growth/notion";
import { queryRecentDataSource } from "@/lib/growth/notionRepository";
import { growthOpsViewFromPages, type GrowthOpsView } from "@/lib/growth/workerLog";

export const runtime = "nodejs";

function emptyOps(setupMissing: boolean): GrowthOpsView {
  return {
    setupMissing,
    worker: {
      status: "unknown",
      workerId: null,
      lastHeartbeatAt: null,
      currentJob: null,
    },
    currentTargets: [],
    recentRuns: [],
    recentFailures: [],
    reconcileFindings: [],
  };
}

export async function GET(request: Request): Promise<Response> {
  if (!verifyToken(request)) return unauthorized();

  const dataSourceId = process.env.GROWTH_WORKER_LOG_DS;
  const token = process.env.NOTION_TOKEN;
  if (!dataSourceId) {
    return NextResponse.json({ success: true, ops: emptyOps(true) });
  }
  if (!token) {
    return NextResponse.json({ success: false, error: "サーバー設定エラー" }, { status: 500 });
  }

  try {
    const pages = await queryRecentDataSource(
      dataSourceId,
      {
        sorts: [{ property: "記録時刻", direction: "descending" }],
      },
      50,
      { token, fetchFn: defaultFetch }
    );
    return NextResponse.json({ success: true, ops: growthOpsViewFromPages(pages) });
  } catch {
    return NextResponse.json(
      { success: false, error: "運用ログの取得中にエラーが発生しました" },
      { status: 502 }
    );
  }
}
