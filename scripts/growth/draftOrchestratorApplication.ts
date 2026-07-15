export interface DraftPublishResult {
  isPartial: boolean;
  recoveryCommand?: string;
}

/** work directory 作成中の失敗も含め、main 全体の終了時に作成済み資源を解放する。 */
export async function runWithDraftWorkDirCleanup<T>(
  directories: string[],
  run: () => Promise<T>,
  cleanup: (directories: readonly string[]) => Promise<void>,
): Promise<T> {
  try {
    return await run();
  } finally {
    await cleanup(directories);
  }
}

export interface DraftOrchestratorApplicationPorts<
  TTarget,
  TSettings,
  TResearch,
  TWriter = TTarget,
> {
  acquireTarget: () => Promise<TTarget>;
  resolveSettings: () => Promise<TSettings>;
  runResearch: (target: TTarget, settings: TSettings) => Promise<TResearch>;
  runWriter: (
    target: TTarget,
    settings: TSettings,
    research: TResearch,
  ) => Promise<TWriter>;
  runImagePrompt: (writer: TWriter) => Promise<void>;
  publishDraft: (writer: TWriter) => Promise<DraftPublishResult>;
  notify: (target: TTarget, result: DraftPublishResult) => Promise<void>;
  recordPartial: (result: DraftPublishResult) => Promise<void>;
  cleanup: () => Promise<void>;
}

/** CLI から外部 I/O を注入し、下書き生成の工程順だけを決定する。 */
export async function runDraftOrchestratorApplication<
  TTarget,
  TSettings,
  TResearch,
  TWriter = TTarget,
>(
  ports: DraftOrchestratorApplicationPorts<TTarget, TSettings, TResearch, TWriter>,
): Promise<DraftPublishResult> {
  try {
    const target = await ports.acquireTarget();
    const settings = await ports.resolveSettings();
    const research = await ports.runResearch(target, settings);
    const writer = await ports.runWriter(target, settings, research);
    await ports.runImagePrompt(writer);
    const result = await ports.publishDraft(writer);
    await ports.notify(target, result);
    if (result.isPartial) await ports.recordPartial(result);
    return result;
  } finally {
    await ports.cleanup();
  }
}
