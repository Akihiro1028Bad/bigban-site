"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type {
  ModelCatalogItem,
  ModelEffort,
  ModelPhaseSetting,
  ModelProvider,
  ModelSettingInput,
} from "@/lib/growth/modelSettings";

import { fetchModelSettings, putModelSetting } from "./api";
import type { ModelSettingsData } from "./api";

interface ModelSettingsViewProps {
  token: string;
}

const QUERY_KEY = "growth-model-settings";

export function ModelSettingsView({ token }: ModelSettingsViewProps) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [QUERY_KEY, token],
    queryFn: () => fetchModelSettings(token),
  });

  if (query.status === "pending") {
    return (
      <p role="status" className="px-5 py-4 text-[13px]" style={{ color: "var(--p-text-3)" }}>
        AIモデル設定を読み込み中…
      </p>
    );
  }
  if (query.status === "error") {
    return (
      <p role="alert" className="mx-5 mt-4 px-3 py-2 text-[13px]" style={{ color: "var(--p-red)" }}>
        {query.error instanceof Error ? query.error.message : "取得に失敗しました。"}
      </p>
    );
  }

  function handleSaved(setting: ModelPhaseSetting): void {
    queryClient.setQueryData<ModelSettingsData>([QUERY_KEY, token], (current) =>
      ({
        ...current!,
        settings: current!.settings.map((item) => (item.id === setting.id ? setting : item)),
      }),
    );
  }

  return (
    <section aria-label="AIモデル設定" className="h-full overflow-y-auto">
      <header className="px-5 py-4" style={{ borderBottom: "1px solid var(--p-border)" }}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="text-[17px] font-semibold">AIモデル設定</h2>
          <span className="text-[11.5px]" style={{ color: "var(--p-text-3)" }}>
            次回のworker起動から適用
          </span>
        </div>
        {query.data.warning ? (
          <p
            role="status"
            className="mt-3 rounded-[6px] px-3 py-2 text-[11.5px]"
            style={{ background: "var(--p-bg-raised)", color: "var(--p-text-2)" }}
          >
            {query.data.warning} 保存するにはDBをNotionインテグレーションへ共有してください。
          </p>
        ) : null}
      </header>

      <div className="divide-y" style={{ borderColor: "var(--p-border)" }}>
        {query.data.settings.map((setting) => (
          <ModelSettingRow
            key={setting.id}
            token={token}
            setting={setting}
            catalog={query.data.catalog}
            efforts={query.data.efforts}
            isStorageAvailable={query.data.storageAvailable}
            onSaved={handleSaved}
          />
        ))}
      </div>
    </section>
  );
}

interface ModelSettingRowProps {
  token: string;
  setting: ModelPhaseSetting;
  catalog: ModelCatalogItem[];
  efforts: Record<ModelProvider, readonly ModelEffort[]>;
  isStorageAvailable: boolean;
  onSaved: (setting: ModelPhaseSetting) => void;
}

function ModelSettingRow({
  token,
  setting,
  catalog,
  efforts,
  isStorageAvailable,
  onSaved,
}: ModelSettingRowProps) {
  const [provider, setProvider] = useState<ModelProvider>(setting.provider);
  const [model, setModel] = useState(setting.model);
  const [effort, setEffort] = useState<ModelEffort>(setting.effort);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  const providerModels = catalog.filter((item) => item.provider === provider);
  const providerEfforts = efforts[provider];
  const isChanged =
    provider !== setting.provider || model !== setting.model || effort !== setting.effort;

  function handleProviderChange(next: ModelProvider): void {
    setProvider(next);
    setModel(catalog.find((item) => item.provider === next)?.id ?? "");
    setEffort(efforts[next][0] ?? "medium");
    setStatus("idle");
    setError("");
  }

  async function handleSave(): Promise<void> {
    const input: ModelSettingInput = {
      phaseId: setting.id,
      provider,
      model,
      effort,
    };
    setStatus("saving");
    setError("");
    try {
      const saved = await putModelSetting(token, input);
      onSaved(saved);
      setStatus("saved");
    } catch (saveError: unknown) {
      setStatus("error");
      setError(saveError instanceof Error ? saveError.message : "保存に失敗しました。");
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(220px,1.3fr)_150px_minmax(190px,1fr)_130px_112px] xl:items-end">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold">{setting.label}</h3>
            <span
              className="rounded-[5px] px-1.5 py-0.5 text-[10.5px]"
              style={{ background: "var(--p-bg-raised)", color: "var(--p-text-3)" }}
            >
              {setting.source === "notion" ? "保存済み" : "推奨値"}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--p-text-3)" }}>
            {setting.description}
          </p>
          <p className="mt-1 text-[10.5px]" style={{ color: "var(--p-text-3)" }}>
            {setting.modes.map((mode) => `growth:${mode}`).join(" / ")}
          </p>
        </div>

        <LabeledSelect
          label={`${setting.label}のプロバイダー`}
          value={provider}
          onChange={(value) => handleProviderChange(value as ModelProvider)}
          options={[
            { value: "codex", label: "OpenAI (Codex)" },
            { value: "claude", label: "Claude" },
          ]}
        />
        <LabeledSelect
          label={`${setting.label}のモデル`}
          value={model}
          onChange={(value) => {
            setModel(value);
            setStatus("idle");
          }}
          options={providerModels.map((item) => ({ value: item.id, label: item.label, title: item.note }))}
        />
        <LabeledSelect
          label={`${setting.label}の推論強度`}
          value={effort}
          onChange={(value) => {
            setEffort(value as ModelEffort);
            setStatus("idle");
          }}
          options={providerEfforts.map((value) => ({ value, label: value }))}
        />
        <button
          type="button"
          aria-label={`${setting.label}を保存`}
          className="approve-btn-primary h-[38px]"
          disabled={!isStorageAvailable || !isChanged || status === "saving"}
          onClick={() => void handleSave()}
        >
          {status === "saving" ? "保存中…" : "保存"}
        </button>
      </div>
      {status === "saved" ? (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--p-green)" }}>
          保存しました
        </p>
      ) : null}
      {status === "error" ? (
        <p role="alert" className="mt-2 text-[11.5px]" style={{ color: "var(--p-red)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface SelectOption {
  value: string;
  label: string;
  title?: string;
}

interface LabeledSelectProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

function LabeledSelect({ label, value, options, onChange }: LabeledSelectProps) {
  return (
    <label className="grid gap-1 text-[10.5px]" style={{ color: "var(--p-text-3)" }}>
      {label.replace(/の(プロバイダー|モデル|推論強度)$/, "$1")}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-[38px] min-w-0 rounded-[7px] px-2 text-[12.5px]"
        style={{
          background: "var(--p-bg-input)",
          border: "1px solid var(--p-border)",
          color: "var(--p-text)",
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} title={option.title}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
