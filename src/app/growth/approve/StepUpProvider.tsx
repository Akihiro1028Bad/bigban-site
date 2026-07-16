"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import type { StepUpScope } from "@/lib/growth/authSession";
import { readJsonObject } from "@/lib/growth/safeJson";

import { sessionHeaders } from "./sessionHeaders";

type PrivilegedOperation = () => Promise<Response>;

interface StepUpContextValue {
  runPrivileged(scope: StepUpScope, operation: PrivilegedOperation): Promise<Response>;
}

const StepUpContext = createContext<StepUpContextValue>({
  runPrivileged: (_scope, operation) => operation(),
});

interface PendingOperation {
  scope: StepUpScope;
  operation: PrivilegedOperation;
  resolve: (response: Response) => void;
  reject: (reason: unknown) => void;
}

export interface StepUpProviderProps {
  children: ReactNode;
  now?: () => number;
}

export function StepUpProvider({ children, now = Date.now }: StepUpProviderProps) {
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const validUntilRef = useRef<Record<StepUpScope, number>>({ publish: 0, media: 0 });

  const executeWithRetry = useCallback(async (item: PendingOperation): Promise<void> => {
    const response = await item.operation();
    if (response.status === 403) {
      const json = await readJsonObject(response.clone());
      if (json.code === "STEP_UP_REQUIRED") {
        validUntilRef.current[item.scope] = 0;
        setError("再認証の有効期限が切れました。もう一度入力してください。");
        return;
      }
    }
    setPending(null);
    item.resolve(response);
  }, []);

  const runPrivileged = useCallback((scope: StepUpScope, operation: PrivilegedOperation): Promise<Response> => {
    if (validUntilRef.current[scope] > now()) {
      return operation().then(async (response) => {
        if (response.status !== 403) return response;
        const json = await readJsonObject(response.clone());
        if (json.code !== "STEP_UP_REQUIRED") return response;
        validUntilRef.current[scope] = 0;
        return new Promise<Response>((resolve, reject) => {
          setError("再認証の有効期限が切れました。もう一度入力してください。");
          setPending({ scope, operation, resolve, reject });
        });
      });
    }
    return new Promise<Response>((resolve, reject) => {
      setError("");
      setPending({ scope, operation, resolve, reject });
    });
  }, [now]);

  const contextValue = useMemo(() => ({ runPrivileged }), [runPrivileged]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!passphrase.trim()) {
      setError("合言葉を入力してください。");
      return;
    }
    /* istanbul ignore next -- @preserve formはpending時だけ描画される */
    if (!pending) return;
    const submitted = passphrase;
    setPassphrase("");
    setIsBusy(true);
    setError("");
    try {
      const response = await fetch("/api/growth/auth/step-up", {
        method: "POST",
        headers: sessionHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ passphrase: submitted, scope: pending.scope }),
      });
      const json = await readJsonObject(response);
      if (!response.ok || json.success !== true || typeof json.expiresAt !== "number") {
        setError(json.error ?? "再認証に失敗しました。");
        return;
      }
      validUntilRef.current[pending.scope] = json.expiresAt;
      await executeWithRetry(pending);
    } catch (reason) {
      pending.reject(reason);
      setPending(null);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <StepUpContext.Provider value={contextValue}>
      {children}
      {pending ? (
        <div role="dialog" aria-modal="true" aria-labelledby="step-up-title" className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
          <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h2 id="step-up-title" className="text-lg font-bold text-gray-900">重要操作の再認証</h2>
            <p className="mt-2 text-sm text-gray-700">
              {pending.scope === "publish" ? "公開操作" : "メディア操作"}を続けるため、合言葉を再入力してください。
            </p>
            <label htmlFor="step-up-passphrase" className="mt-4 block text-sm font-medium text-gray-800">合言葉</label>
            <input
              id="step-up-passphrase"
              type="password"
              autoComplete="off"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              className="mt-1 min-h-11 w-full rounded-md border border-gray-300 px-3"
            />
            {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
            <button type="submit" disabled={isBusy} className="mt-4 min-h-11 w-full rounded-md bg-blue-600 px-4 text-white disabled:opacity-50">
              再認証する
            </button>
          </form>
        </div>
      ) : null}
    </StepUpContext.Provider>
  );
}

export function useStepUp(): StepUpContextValue {
  return useContext(StepUpContext);
}
