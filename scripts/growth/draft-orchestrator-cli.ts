import "dotenv/config";

import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ModelPhaseSetting } from "../../src/lib/growth/modelSettings";

import { buildDraftAgentInvocation, draftPhaseExecutionLabel, resolveDraftPhaseSetting, type DraftAiPhase, type DraftPhaseSetting } from "./draftAgent";
import { assemblePublishSpec, buildFacilityResearchContext, buildWriterInput, cleanupDraftWorkDirs, draftInputFromPage, draftRunMode, invalidatePublishResumeFiles, parseValidatedWriterOutput, prepareOutlineImages, publishedContentId, resolveDraftGenerationScope, runDraftNotificationBestEffort, selectRelevantFacilityContext, shouldResumePublishSpec, stageCacheKey, workerLogTargetFields } from "./draftOrchestrator";
import type { DraftGenerationMarker } from "./draftOrchestrator";
import { parseResearchPacket, RESEARCH_OUTPUT_JSON_SCHEMA, validateResearchPacketSources, type ResearchPacket, type ValidatedWriterOutput } from "./draftPipeline";
import { parseFacilityContextData } from "./facility-context";
import { defaultFetch } from "./http";
import { getPage, updatePageSelect, type NotionApiOptions } from "./notion";
import { queryAllDataSource } from "./notionRepository";
import { selectDraftsAutoTarget, draftsAutoQueryFilter, DRAFTS_AUTO_STATUS_PROP } from "./draftsAuto";
import { buildProcessFailureDetail, resolveTimeoutPolicy, runProcess } from "./processControl.mjs";
import type { ProcessResult } from "./processControl.mjs";
import { buildGrowthOperationResult, mergeGrowthOperationResults, normalizeGrowthOperationResult } from "./operationOutcome";

import type { GrowthOperationResult } from "./operationOutcome";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const ideaDataSource = "5adab8b1-f182-4123-b963-9463a2580d4a";
const researchTtlMs = 24 * 60 * 60 * 1000;
const timeoutPolicy = resolveTimeoutPolicy(process.env);
const jobId = process.env.GROWTH_JOB_ID || randomUUID();
const failureLogPath = path.join(root, "data", "growth-failures.log");

const writerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["slug", "excerpt", "bodyHtml", "usedFactIds"],
  properties: {
    slug: { type: "string" },
    excerpt: { type: "string" },
    bodyHtml: { type: "string" },
    usedFactIds: { type: "array", items: { type: "string" } },
  },
} as const;

interface CacheEnvelope {
  key: string;
  createdAt: string;
  value: unknown;
}

let executionSettingsSummary = "モデル設定確定前";

class ProcessExecutionError extends Error {
  constructor(
    readonly result: ProcessResult,
    readonly timeoutMs: number,
    readonly resumeCommand: string,
    message: string,
  ) {
    super(message);
    this.name = "ProcessExecutionError";
  }
}

function processFailureDetail(error: ProcessExecutionError): string {
  return buildProcessFailureDetail(error.result, {
    jobId,
    timeoutMs: error.timeoutMs,
    resumeCommand: error.resumeCommand,
  });
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} が未設定です。`);
  return value;
}

function notionOptions(): NotionApiOptions {
  return { token: requireEnv("NOTION_TOKEN"), fetchFn: defaultFetch };
}

async function targetPage(pageId: string | undefined) {
  if (pageId) return getPage(pageId, notionOptions());
  const pages = await queryAllDataSource(ideaDataSource, { filter: draftsAutoQueryFilter() }, notionOptions());
  const target = selectDraftsAutoTarget(pages);
  if (!target) throw new Error("下書き生成対象がありません。");
  const status = target.properties[DRAFTS_AUTO_STATUS_PROP] as { select?: { name?: string } | null } | undefined;
  if (status?.select?.name === "承認") {
    await updatePageSelect(target.id, DRAFTS_AUTO_STATUS_PROP, "生成中", notionOptions());
  }
  return target;
}

async function resolveSettings(): Promise<Record<DraftAiPhase, DraftPhaseSetting>> {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const phases: DraftAiPhase[] = ["draft-research", "draft-write"];
  const result = await runProcess(npm, ["run", "--silent", "growth:model-settings", "--", "resolve-many", ...phases], {
    timeoutMs: timeoutPolicy.controlMs,
    phase: "model-settings",
    cwd: root,
    stdio: "capture",
    shell: process.platform === "win32",
    env: { ...process.env, GROWTH_JOB_ID: jobId },
  });
  if (result.exitCode !== 0) {
    throw new ProcessExecutionError(result, timeoutPolicy.controlMs, `npm run growth:${process.env.GROWTH_DRAFT_RUN_MODE || "drafts"}`, "下書き工程のモデル設定を取得できませんでした。");
  }
  const parsed = JSON.parse(result.stdout.trim()) as Record<string, ModelPhaseSetting>;
  return {
    "draft-research": resolveDraftPhaseSetting(parsed["draft-research"]),
    "draft-write": resolveDraftPhaseSetting(parsed["draft-write"]),
  };
}

function parseAgentJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```json\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(trimmed) as unknown;
  if (parsed && typeof parsed === "object") {
    const record = parsed as Record<string, unknown>;
    if (record.structured_output !== undefined) return record.structured_output;
    if (typeof record.result === "string") return JSON.parse(record.result);
  }
  return parsed;
}

function operationResultFromOutput(output: string): GrowthOperationResult {
  const line = output.split("\n").find((item) => item.startsWith("growthOutcome="));
  if (!line) return buildGrowthOperationResult({ outcome: "success", message: "下書き投入が完了しました。" });
  try {
    return normalizeGrowthOperationResult(JSON.parse(line.slice("growthOutcome=".length)) as unknown);
  } catch {
    return buildGrowthOperationResult({ outcome: "retryable-failure", message: "下書き投入結果を確認できませんでした。" });
  }
}

async function runAgent(params: {
  phase: DraftAiPhase;
  setting: DraftPhaseSetting;
  prompt: string;
  schema: unknown;
  workDir: string;
}): Promise<unknown> {
  const schemaPath = path.join(params.workDir, `${params.phase}-schema.json`);
  const outputPath = path.join(params.workDir, `${params.phase}-last.json`);
  const schemaJson = JSON.stringify(params.schema);
  await writeFile(schemaPath, schemaJson, "utf-8");
  const invocation = buildDraftAgentInvocation({
    phase: params.phase,
    setting: params.setting,
    cwd: params.workDir,
    schemaPath,
    schemaJson,
    outputPath,
  });
  const timeoutMs = params.phase === "draft-research" ? timeoutPolicy.draftResearchMs : timeoutPolicy.draftWriteMs;
  const result = await runProcess(invocation.command, invocation.args, {
    timeoutMs,
    killGraceMs: timeoutPolicy.killGraceMs,
    phase: params.phase,
    cwd: invocation.isolatedCwd,
    stdin: params.prompt,
    stdio: "capture",
    shell: process.platform === "win32",
    env: { ...process.env, GROWTH_JOB_ID: jobId },
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.exitCode !== 0) {
    const resumeCommand = `npm run growth:${process.env.GROWTH_DRAFT_RUN_MODE || "drafts"}`;
    const processError = new ProcessExecutionError(result, timeoutMs, resumeCommand, `${params.phase}に失敗しました: ${(result.stderr || result.stdout || "終了コード不明").trim()}`);
    if (result.kind === "timeout") processError.message = `${params.phase}に失敗しました: ${processFailureDetail(processError)}`;
    throw processError;
  }
  const raw = invocation.outputFromStdout ? result.stdout : await readFile(invocation.outputPath, "utf-8");
  return parseAgentJson(raw);
}

function cached(file: string, key: string, ttlMs?: number): unknown | null {
  if (!existsSync(file)) return null;
  try {
    const envelope = JSON.parse(readFileSync(file, "utf-8")) as CacheEnvelope;
    if (envelope.key !== key) return null;
    if (ttlMs !== undefined && Date.now() - Date.parse(envelope.createdAt) > ttlMs) return null;
    return envelope.value;
  } catch {
    return null;
  }
}

function saveCache(file: string, key: string, value: unknown): void {
  writeFileSync(file, JSON.stringify({ key, createdAt: new Date().toISOString(), value }, null, 2));
}

function readGenerationMarker(file: string): DraftGenerationMarker | null {
  if (!existsSync(file)) return null;
  try {
    const value = JSON.parse(readFileSync(file, "utf-8")) as Record<string, unknown>;
    if (typeof value.sourceId !== "string" || typeof value.attemptId !== "string") return null;
    if (!value.sourceId || !value.attemptId) return null;
    return { sourceId: value.sourceId, attemptId: value.attemptId };
  } catch {
    return null;
  }
}

async function workerLog(command: "start" | "finish", fields: Record<string, string | number>): Promise<string> {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const args = ["run", "--silent", "growth:worker-log", "--", command];
  for (const [key, value] of Object.entries(fields)) args.push(`--${key}`, String(value));
  const result = await runProcess(npm, args, {
    timeoutMs: timeoutPolicy.controlMs,
    phase: `worker-log-${command}`,
    cwd: root,
    stdio: "capture",
    shell: process.platform === "win32",
    env: { ...process.env, GROWTH_JOB_ID: jobId },
  });
  if (result.exitCode !== 0) return "";
  return result.stdout.trim().split("\n").filter(Boolean).pop() ?? "";
}

function startPhaseLog(pageId: string, phase: DraftAiPhase, setting: DraftPhaseSetting): Promise<string> {
  return workerLog("start", {
    mode: phase,
    status: "running",
    kind: "job",
    name: `${phase} running`,
    ...workerLogTargetFields(pageId),
    detail: draftPhaseExecutionLabel(phase, setting),
    "job-id": jobId,
  });
}

async function finishPhaseLog(
  logPageId: string,
  pageId: string,
  phase: DraftAiPhase,
  setting: DraftPhaseSetting,
  status: "success" | "failed",
  detail: string,
): Promise<void> {
  if (!logPageId) return;
  await workerLog("finish", {
    "page-id": logPageId,
    mode: phase,
    status,
    kind: "job",
    name: `${phase} ${status}`,
    ...workerLogTargetFields(pageId),
    detail: `${draftPhaseExecutionLabel(phase, setting)}; ${detail}`,
    "job-id": jobId,
  });
}

async function runNpm(script: string, args: string[] = [], capture = false, timeoutMs = timeoutPolicy.controlMs): Promise<string> {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = await runProcess(npm, ["run", "--silent", script, ...(args.length ? ["--", ...args] : [])], {
    timeoutMs,
    killGraceMs: timeoutPolicy.killGraceMs,
    phase: script,
    cwd: root,
    shell: process.platform === "win32",
    env: { ...process.env, GROWTH_JOB_ID: jobId },
    stdio: capture ? "capture" : "inherit",
  });
  if (result.exitCode !== 0) {
    const detail = capture ? [result.stdout, result.stderr].filter(Boolean).join("\n").trim() : "";
    const resumeCommand = `npm run growth:${process.env.GROWTH_DRAFT_RUN_MODE || "drafts"}`;
    const processError = new ProcessExecutionError(result, timeoutMs, resumeCommand, `${script}に失敗しました。${detail ? ` ${detail}` : ""}`);
    if (result.kind === "timeout") processError.message = `${script}に失敗しました。 ${processFailureDetail(processError)}`;
    throw processError;
  }
  return capture ? result.stdout : "";
}

async function publishAndNotify(params: {
  specPath: string;
  input: ReturnType<typeof draftInputFromPage>;
  stateDir: string;
  generationMarkerPath: string;
  checkpointPath: string;
  hasGenerationMarker: boolean;
  writerPath?: string;
}): Promise<void> {
  let publishOut: string;
  try {
    publishOut = await runNpm("growth:publish-draft", [params.specPath], true, timeoutPolicy.publishDraftMs);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    invalidatePublishResumeFiles(
      message,
      [params.writerPath, params.specPath, params.checkpointPath].filter((file): file is string => file !== undefined),
      { exists: existsSync, remove: unlinkSync },
    );
    throw error;
  }
  process.stdout.write(publishOut);
  const publishResult = operationResultFromOutput(publishOut);
  const contentId = publishedContentId(publishOut);
  if (publishResult.outcome === "success" && params.hasGenerationMarker && existsSync(params.generationMarkerPath)) {
    unlinkSync(params.generationMarkerPath);
  }
  const notifyPath = path.join(params.stateDir, "notify.json");
  writeFileSync(notifyPath, JSON.stringify([{ title: params.input.title, contentId, media: params.input.media }]));
  const notificationResult = await runDraftNotificationBestEffort({
    notifyPath,
    notify: async () => void await runNpm("growth:notify-drafts", [notifyPath]),
    warn: (message) => process.stderr.write(`${message}\n`),
  });
  const finalResult = mergeGrowthOperationResults(publishResult, notificationResult);
  if (finalResult.outcome === "partial") {
    const resumeCommand = finalResult.recovery?.command ?? `npm run growth:publish-draft -- ${params.specPath}`;
    try {
      await runNpm("growth:learning-log", [
        "append-partial",
        draftRunMode(process.env),
        finalResult.failedStage ?? "unknown",
        resumeCommand,
        finalResult.message,
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`学習ログへの部分成功記録に失敗しました: ${message}\n`);
    }
  }
  process.stdout.write(`draftOutcome=${JSON.stringify(finalResult)}\n`);
}

async function main(): Promise<void> {
  const workDirs: string[] = [];
  try {
  const executionStartedAt = new Date();
  const page = await targetPage(process.argv[2]);
  const input = draftInputFromPage(page);
  if (!input.title || !/^#{2,3}\s+\S+/m.test(input.outline)) throw new Error("承認済みタイトルまたは構成案が不足しています。");
  const stateDir = path.join(root, ".growth-tmp", "drafts", input.pageId.replace(/[^a-zA-Z0-9-]/g, "-"));
  mkdirSync(stateDir, { recursive: true });
  const generationMarkerPath = path.join(stateDir, "generation-attempt.json");
  const generation = resolveDraftGenerationScope(
    input.rebuildSourceId,
    readGenerationMarker(generationMarkerPath),
    randomUUID,
  );
  const specPath = path.join(stateDir, "publish-spec.json");
  const checkpointPath = path.join(stateDir, "publish-checkpoint.json");
  const writerPath = path.join(stateDir, "writer-output.json");
  if (shouldResumePublishSpec(existsSync(checkpointPath), existsSync(specPath))) {
    await publishAndNotify({
      specPath,
      input,
      stateDir,
      generationMarkerPath,
      checkpointPath,
      hasGenerationMarker: generation.marker !== null,
      writerPath,
    });
    return;
  }
  const prepared = prepareOutlineImages(input.outline);
  const facilityRaw = JSON.parse(readFileSync(path.join(here, "facility-context.json"), "utf-8")) as unknown;
  const facility = parseFacilityContextData(facilityRaw);
  const facilityContext = buildFacilityResearchContext(facility, executionStartedAt);
  const articleContext = [input.title, input.outline, input.audience, input.searchIntent, input.cta].join("\n");
  const relevantFacilityContext = selectRelevantFacilityContext(facilityContext, articleContext);
  const settings = await resolveSettings();
  const researchSetting = settings["draft-research"];
  const writerSetting = settings["draft-write"];
  executionSettingsSummary = [
    draftPhaseExecutionLabel("draft-research", researchSetting),
    draftPhaseExecutionLabel("draft-write", writerSetting),
  ].join("; ");
  const promptResearch = readFileSync(path.join(here, "prompts", "draft-research.md"), "utf-8");
  const promptWrite = readFileSync(path.join(here, "prompts", "draft-write.md"), "utf-8");
  if (generation.marker) {
    writeFileSync(generationMarkerPath, JSON.stringify(generation.marker, null, 2));
  } else if (existsSync(generationMarkerPath)) {
    unlinkSync(generationMarkerPath);
  }
  writeFileSync(path.join(stateDir, "input.json"), JSON.stringify({ input, facility: relevantFacilityContext }, null, 2));
  const researchWorkDir = await mkdtemp(path.join(os.tmpdir(), "growth-draft-research-"));
  workDirs.push(researchWorkDir);
  const writerWorkDir = await mkdtemp(path.join(os.tmpdir(), "growth-draft-write-"));
  workDirs.push(writerWorkDir);

  const researchInput = { title: input.title, outline: prepared.outline, audience: input.audience, searchIntent: input.searchIntent, primaryNotes: input.primaryNotes, facility: relevantFacilityContext };
  const researchKey = stageCacheKey({ input: researchInput, prompt: promptResearch, model: researchSetting, cacheScope: generation.cacheScope });
  const researchPath = path.join(stateDir, "research.json");
  const trustedResearchSources = {
    facilityName: relevantFacilityContext.name,
    facilityConfirmed: relevantFacilityContext.confirmed,
    facilityLocation: relevantFacilityContext.location,
    primaryNotes: input.primaryNotes,
  };
  let researchValue = cached(researchPath, researchKey, researchTtlMs);
  let cachedResearch: ResearchPacket | null = null;
  if (researchValue !== null) {
    try {
      cachedResearch = validateResearchPacketSources(
        parseResearchPacket(researchValue),
        trustedResearchSources,
      );
    } catch {
      unlinkSync(researchPath);
      researchValue = null;
    }
  }
  const researchWasCached = cachedResearch !== null;
  const researchLogId = await startPhaseLog(input.pageId, "draft-research", researchSetting);
  let research: ResearchPacket;
  try {
    if (researchValue === null) {
      researchValue = await runAgent({ phase: "draft-research", setting: researchSetting, prompt: `${promptResearch}\n\n<input_json>\n${JSON.stringify(researchInput)}\n</input_json>`, schema: RESEARCH_OUTPUT_JSON_SCHEMA, workDir: researchWorkDir });
    }
    research = cachedResearch ?? validateResearchPacketSources(
      parseResearchPacket(researchValue),
      trustedResearchSources,
    );
    if (!researchWasCached) saveCache(researchPath, researchKey, researchValue);
    await finishPhaseLog(researchLogId, input.pageId, "draft-research", researchSetting, "success", researchWasCached ? "cache hit" : "AI completed");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await finishPhaseLog(researchLogId, input.pageId, "draft-research", researchSetting, "failed", message);
    if (error instanceof ProcessExecutionError) throw error;
    throw new Error(`${draftPhaseExecutionLabel("draft-research", researchSetting)}; ${message}`);
  }
  const writerInput = buildWriterInput(
    input,
    prepared.outline,
    research,
    relevantFacilityContext.doNotWrite,
  );
  const writerKey = stageCacheKey({ input: writerInput, prompt: promptWrite, model: writerSetting, cacheScope: generation.cacheScope });
  let writerValue = cached(writerPath, writerKey);
  let cachedWriter: ValidatedWriterOutput | null = null;
  if (writerValue !== null) {
    try {
      cachedWriter = parseValidatedWriterOutput(writerValue, research, prepared.outline);
    } catch {
      unlinkSync(writerPath);
      writerValue = null;
    }
  }
  const writerWasCached = cachedWriter !== null;
  const writerLogId = await startPhaseLog(input.pageId, "draft-write", writerSetting);
  let writer: ValidatedWriterOutput;
  try {
    if (writerValue === null) {
      writerValue = await runAgent({ phase: "draft-write", setting: writerSetting, prompt: `${promptWrite}\n\n<input_json>\n${JSON.stringify(writerInput)}\n</input_json>`, schema: writerSchema, workDir: writerWorkDir });
    }
    writer = cachedWriter ?? parseValidatedWriterOutput(writerValue, research, prepared.outline);
    if (!writerWasCached) saveCache(writerPath, writerKey, writerValue);
    await finishPhaseLog(writerLogId, input.pageId, "draft-write", writerSetting, "success", writerWasCached ? "cache hit" : "AI completed");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await finishPhaseLog(writerLogId, input.pageId, "draft-write", writerSetting, "failed", message);
    if (error instanceof ProcessExecutionError) throw error;
    throw new Error(`${draftPhaseExecutionLabel("draft-write", writerSetting)}; ${message}`);
  }
  const spec = assemblePublishSpec({ input, writer, research, images: prepared.images, doNotWrite: relevantFacilityContext.doNotWrite });
  spec.imagePath = path.join(stateDir, "growth-eyecatch.png");
  writeFileSync(specPath, JSON.stringify(spec, null, 2));
  await runNpm("growth:image-prompt", [specPath], false, timeoutPolicy.imagePromptMs);
  await publishAndNotify({
    specPath,
    input,
    stateDir,
    generationMarkerPath,
    checkpointPath,
    hasGenerationMarker: generation.marker !== null,
    writerPath,
  });
  } finally {
    await cleanupDraftWorkDirs(workDirs, rm);
  }
}

main().catch(async (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const processDetail = error instanceof ProcessExecutionError ? processFailureDetail(error) : "";
  const isTimeout = error instanceof ProcessExecutionError && error.result.kind === "timeout";
  const evidenceExitCode = isTimeout ? "124" : "70";
  const detail = `${executionSettingsSummary}; ${message}${processDetail && !message.includes(processDetail) ? `; ${processDetail}` : ""}; orchestratorExit=70`;
  process.stderr.write(`下書きオーケストレーターに失敗しました: ${detail}\n`);
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  if (isTimeout) {
    const resumeCommand = error.resumeCommand;
    mkdirSync(path.dirname(failureLogPath), { recursive: true });
    appendFileSync(
      failureLogPath,
      `${new Date().toISOString()}\tsource=draft-orchestrator:${error.result.phase}\tjobId=${jobId}\texit=124\tresume=${resumeCommand}\tdetail=${detail.replace(/[\r\n\t]+/g, " ")}\n`,
      "utf8",
    );
    await workerLog("start", {
      mode: error.result.phase,
      status: "failed",
      kind: "job",
      name: `${error.result.phase} timeout`,
      "target-type": "system",
      "job-id": jobId,
      "exit-code": 124,
      detail,
      resume: resumeCommand,
    });
  }
  await runProcess(npm, ["run", "growth:notify-loop-fail"], {
    timeoutMs: timeoutPolicy.controlMs,
    phase: "notify-loop-fail",
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      GROWTH_LOOP_MODE: process.env.GROWTH_DRAFT_RUN_MODE || "drafts",
      GROWTH_LOOP_RESUME: `npm run growth:${process.env.GROWTH_DRAFT_RUN_MODE || "drafts"}`,
      GROWTH_LOOP_KIND: isTimeout ? "timeout" : "nonzero-exit",
      GROWTH_LOOP_EXIT: evidenceExitCode,
      GROWTH_LOOP_DETAIL: detail,
      ...(error instanceof ProcessExecutionError ? {
        GROWTH_LOOP_TIMEOUT_MS: String(error.timeoutMs),
        GROWTH_LOOP_TERM_SENT: String(error.result.termSent),
        GROWTH_LOOP_FORCE_KILLED: String(error.result.forceKilled),
      } : {}),
    },
  });
  await runProcess(npm, ["run", "growth:learning-log", "--", "append-fail", process.env.GROWTH_DRAFT_RUN_MODE || "drafts", evidenceExitCode, detail], {
    timeoutMs: timeoutPolicy.controlMs,
    phase: "learning-log",
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env },
  });
  process.exit(70);
});
