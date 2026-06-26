/**
 * 承認画面のログイン(合言葉)画面(#H7 分解)。状態は親(ApproveClient)が持ち、ここは表示のみ。
 */

"use client";

import type { FormEvent, RefObject } from "react";

import { TAP_TARGET } from "./approveStyles";

interface LoginScreenProps {
  passphrase: string;
  onPassphraseChange: (value: string) => void;
  showPassphrase: boolean;
  onToggleShow: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  busy: boolean;
  message: string;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function LoginScreen({
  passphrase,
  onPassphraseChange,
  showPassphrase,
  onToggleShow,
  onSubmit,
  busy,
  message,
  inputRef,
}: LoginScreenProps) {
  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-xl font-bold text-gray-900">承認ページ</h1>
      <p className="mt-2 text-sm text-gray-700">LINE で届いた合言葉を入力してください。</p>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <div className="space-y-1">
          <label htmlFor="passphrase" className="block text-sm font-medium text-gray-800">
            合言葉
          </label>
          <div className="flex gap-2">
            <input
              id="passphrase"
              ref={inputRef}
              type={showPassphrase ? "text" : "password"}
              value={passphrase}
              onChange={(event) => onPassphraseChange(event.target.value)}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={message ? true : undefined}
              aria-describedby={message ? "passphrase-error" : undefined}
              className="min-h-11 w-full rounded-md border border-gray-300 px-3 text-base text-gray-900"
            />
            <button
              type="button"
              onClick={onToggleShow}
              aria-label={showPassphrase ? "合言葉を隠す" : "合言葉を表示"}
              className={`${TAP_TARGET} shrink-0 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
            >
              {showPassphrase ? "隠す" : "表示"}
            </button>
          </div>
        </div>
        <button
          type="submit"
          disabled={busy}
          className={`${TAP_TARGET} w-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50`}
        >
          確認する
        </button>
      </form>
      {message ? (
        <p id="passphrase-error" role="alert" className="mt-3 text-sm text-red-700">
          {message}
        </p>
      ) : null}
    </main>
  );
}
