/**
 * 記事タイトルの直接編集(AI不要)(#H7 分解)。表示↔編集を切り替える。
 */

"use client";

import { choiceButtonClass } from "./approveStyles";

interface TitleEditorProps {
  itemId: string;
  title: string;
  editing: boolean;
  value: string;
  busy: boolean;
  onChange: (value: string) => void;
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function TitleEditor({
  itemId,
  title,
  editing,
  value,
  busy,
  onChange,
  onStartEdit,
  onCancel,
  onSave,
}: TitleEditorProps) {
  return (
    <div className="mb-3">
      {editing ? (
        <div>
          <label htmlFor={`title-edit-${itemId}`} className="block text-xs font-medium text-gray-500">
            記事タイトル
          </label>
          <input
            id={`title-edit-${itemId}`}
            type="text"
            aria-label="タイトルを編集"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="mt-1 w-full rounded-md border border-gray-300 p-2 text-sm font-medium text-gray-900"
          />
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              aria-label="タイトル編集をキャンセル"
              onClick={onCancel}
              className={choiceButtonClass("border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
            >
              キャンセル
            </button>
            <button
              type="button"
              aria-label="タイトルを保存"
              onClick={onSave}
              disabled={busy}
              className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500">タイトル</span>
          <span className="flex-1 text-sm font-medium text-gray-900">{title}</span>
          <button
            type="button"
            aria-label={`タイトルを編集: ${title}`}
            onClick={onStartEdit}
            className={choiceButtonClass("shrink-0 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
          >
            編集
          </button>
        </div>
      )}
    </div>
  );
}
