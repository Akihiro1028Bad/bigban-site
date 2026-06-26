/**
 * 構成案セクションの本文画像指示(#H7 分解 / #61)。画像チップ一覧＋スタイル選択フォーム。
 * 実写禁止・1記事上限の範囲で、セクションごとに画像指示を足す/直す/消す。
 */

"use client";

import { motion } from "framer-motion";

import { choiceButtonClass } from "./approveStyles";
import { IMAGE_STYLES, type ImageStyleKey, type OutlineImage } from "./outline";

const MAX_SECTION_IMAGES = 3;
const STYLE_LABEL = Object.fromEntries(IMAGE_STYLES.map((s) => [s.key, s.label])) as Record<
  ImageStyleKey,
  string
>;

interface SectionImagesProps {
  heading: string;
  images: OutlineImage[];
  open: boolean;
  busy: boolean;
  sectionIndex: number;
  imageStyle: ImageStyleKey;
  onImageStyleChange: (value: ImageStyleKey) => void;
  imageDesc: string;
  onImageDescChange: (value: string) => void;
  editing: boolean;
  onStartEdit: (idx: number, image: OutlineImage) => void;
  onDelete: (idx: number) => void;
  onStartAdd: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function SectionImages({
  heading,
  images,
  open,
  busy,
  sectionIndex,
  imageStyle,
  onImageStyleChange,
  imageDesc,
  onImageDescChange,
  editing,
  onStartEdit,
  onDelete,
  onStartAdd,
  onCancel,
  onSave,
}: SectionImagesProps) {
  return (
    <div className="mt-2 border-t border-gray-100 pt-2">
      {images.length > 0 ? (
        <ul className="space-y-1">
          {images.map((image, idx) => (
            <li
              key={idx}
              className="flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 px-2 py-1"
            >
              <span className="shrink-0 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
                {STYLE_LABEL[image.style]}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-gray-700">{image.description}</span>
              <button
                type="button"
                aria-label={`画像を編集: ${heading} ${idx + 1}`}
                onClick={() => onStartEdit(idx, image)}
                disabled={busy}
                className="shrink-0 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-40"
              >
                編集
              </button>
              <button
                type="button"
                aria-label={`画像を削除: ${heading} ${idx + 1}`}
                onClick={() => onDelete(idx)}
                disabled={busy}
                className="shrink-0 text-xs text-gray-500 hover:text-red-700 disabled:opacity-40"
              >
                削除
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {open ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 overflow-hidden"
        >
          <label htmlFor={`image-style-${sectionIndex}`} className="block text-xs font-medium text-gray-600">
            スタイル
          </label>
          <select
            id={`image-style-${sectionIndex}`}
            value={imageStyle}
            onChange={(event) => onImageStyleChange(event.target.value as ImageStyleKey)}
            className="mt-0.5 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
          >
            {IMAGE_STYLES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <textarea
            aria-label={`画像の説明: ${heading}`}
            value={imageDesc}
            onChange={(event) => onImageDescChange(event.target.value)}
            placeholder="何を描くか（例: 宇宙人がパドルを構える）"
            className="mt-1 h-14 w-full rounded-md border border-gray-300 p-2 text-sm text-gray-900"
          />
          <p className="mt-1 text-xs text-gray-400">
            alt・キャプションは執筆AIが補完します。図解は「イメージ図」として下書きに入り、公開前に確認できます。
          </p>
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className={choiceButtonClass("border border-gray-300 bg-white text-gray-700 hover:bg-gray-50")}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className={choiceButtonClass("border border-blue-600 bg-blue-600 text-white")}
            >
              {editing ? "更新" : "追加"}
            </button>
          </div>
        </motion.div>
      ) : (
        <button
          type="button"
          aria-label={`画像を追加: ${heading}`}
          onClick={onStartAdd}
          disabled={busy || images.length >= MAX_SECTION_IMAGES}
          className="text-xs text-indigo-700 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
        >
          ＋画像（{images.length} / {MAX_SECTION_IMAGES}）
        </button>
      )}
    </div>
  );
}
