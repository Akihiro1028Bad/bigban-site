/**
 * 下書き編集ワークスペース(#proto・#104): 左=エディタ / 右=本番ライブプレビュー の2ペイン。
 * 編集しながら公開後の見た目を横で確認できる(入力追従)。
 */
"use client";

import { useState } from "react";

import { DevicePreview } from "./DevicePreview";
import { InlineEditor } from "./InlineEditor";
import type { Article } from "./types";

interface DraftEditWorkspaceProps {
  article: Article;
  onSave: (html: string) => void;
  onCancel: () => void;
}

export function DraftEditWorkspace({ article, onSave, onCancel }: DraftEditWorkspaceProps) {
  const [liveHtml, setLiveHtml] = useState(article.bodyHtml);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="min-w-0">
        <InlineEditor html={article.bodyHtml} onSave={onSave} onCancel={onCancel} onLiveChange={setLiveHtml} />
      </div>
      <div className="min-w-0">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--p-text-3)" }}>
          ライブプレビュー
        </div>
        <DevicePreview article={{ ...article, bodyHtml: liveHtml }} />
      </div>
    </div>
  );
}
