/**
 * プロンプト面(#proto・#204)。本番承認画面と同じ表示コンポーネントと
 * GET /api/growth/prompts を使い、実ファイルを単一ソースとして表示する。
 */
"use client";

import { useState, type FormEvent } from "react";

import { PromptsView } from "@/app/growth/approve/PromptsView";
import { ApproveProviders } from "@/app/growth/approve/providers";
import { APPROVE_AUTH_ENABLED } from "@/config/featureFlags";

interface PromptRegistryViewProps {
  isAuthEnabled?: boolean;
}

export function PromptRegistryView({
  isAuthEnabled = APPROVE_AUTH_ENABLED,
}: PromptRegistryViewProps) {
  const [passphrase, setPassphrase] = useState("");
  const [token, setToken] = useState<string | null>(isAuthEnabled ? null : "");

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (passphrase.trim() === "") return;
    setToken(passphrase);
  }

  if (token === null) {
    return (
      <form
        onSubmit={handleSubmit}
        className="mx-auto mt-16 flex w-full max-w-sm flex-col gap-3 rounded-[12px] p-5"
        style={{ background: "var(--p-bg-raised)", border: "1px solid var(--p-border)" }}
      >
        <label htmlFor="prompt-registry-passphrase" className="text-[13px] font-semibold">
          承認画面の合言葉
        </label>
        <input
          id="prompt-registry-passphrase"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          autoComplete="current-password"
          className="rounded-[8px] px-3 py-2 text-[14px]"
          style={{ background: "var(--p-bg-input)", border: "1px solid var(--p-border)" }}
        />
        <button type="submit" className="proto-btn-primary">
          プロンプトを表示
        </button>
      </form>
    );
  }

  return (
    <ApproveProviders>
      <PromptsView token={token} query="" />
    </ApproveProviders>
  );
}
