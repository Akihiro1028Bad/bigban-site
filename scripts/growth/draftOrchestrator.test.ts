// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { NotionPage } from "./notion";
import {
  assemblePublishSpec,
  buildFacilityResearchContext,
  buildWriterInput,
  cleanupDraftWorkDirs,
  draftInputFromPage,
  draftRunMode,
  prepareOutlineImages,
  parseValidatedWriterOutput,
  runDraftNotificationBestEffort,
  publishedContentId,
  resolveDraftGenerationScope,
  selectRelevantFacilityContext,
  shouldInvalidateWriterCacheForPublishFailure,
  stageCacheKey,
  validateWriterContract,
  workerLogTargetFields,
  publishDraftRecoveryCommand,
  matchesPublishCheckpointContext,
  invalidatePublishResumeFiles,
  shouldResumePublishSpec,
} from "./draftOrchestrator";
import type { ResearchPacket, ValidatedWriterOutput, WriterOutput } from "./draftPipeline";

function page(properties: Record<string, unknown>): NotionPage {
  return { id: "page-1", url: "", properties };
}

describe("draftOrchestrator", () => {
  it("checkpointと確定specが揃う場合だけ画像設計を飛ばして直接再開する", () => {
    expect(shouldResumePublishSpec(true, true)).toBe(true);
    expect(shouldResumePublishSpec(true, false)).toBe(false);
    expect(shouldResumePublishSpec(false, true)).toBe(false);
    expect(publishDraftRecoveryCommand("/state/publish-spec.json")).toBe("npm run growth:publish-draft -- /state/publish-spec.json");
  });

  it("部分成功の学習modeは実行モードを保持し未設定時だけdraftsへ戻す", () => {
    expect(draftRunMode({ GROWTH_DRAFT_RUN_MODE: "drafts-auto" })).toBe("drafts-auto");
    expect(draftRunMode({})).toBe("drafts");
    expect(draftRunMode({ GROWTH_DRAFT_RUN_MODE: "" })).toBe("drafts");
  });

  it("checkpoint対象は再生成元・endpoint・Notion pageが全て一致する場合だけ復元する", () => {
    const saved = { rebuildSourceId: "source-a", endpoint: "columns", notionPageId: "page-1" };
    expect(matchesPublishCheckpointContext(saved, saved)).toBe(true);
    expect(matchesPublishCheckpointContext(saved, { ...saved, rebuildSourceId: "source-b" })).toBe(false);
    expect(matchesPublishCheckpointContext(saved, { ...saved, endpoint: "news" })).toBe(false);
    expect(matchesPublishCheckpointContext(saved, { ...saved, notionPageId: "page-2" })).toBe(false);
    expect(matchesPublishCheckpointContext(null, saved)).toBe(false);
  });

  it("再生成元がクリア済みでも同じcontentIdがNotionに反映済みならcheckpointを維持する", () => {
    const saved = { rebuildSourceId: "source-a", endpoint: "columns", notionPageId: "page-1" };
    expect(matchesPublishCheckpointContext(saved, {
      rebuildSourceId: "",
      endpoint: "columns",
      notionPageId: "page-1",
      notionContentId: "content-1",
      checkpointContentId: "content-1",
    })).toBe(true);
    expect(matchesPublishCheckpointContext(saved, {
      rebuildSourceId: "",
      endpoint: "columns",
      notionPageId: "page-1",
      notionContentId: "other-content",
      checkpointContentId: "content-1",
    })).toBe(false);
    expect(matchesPublishCheckpointContext(saved, {
      rebuildSourceId: "",
      endpoint: "columns",
      notionPageId: "page-1",
    })).toBe(false);
  });

  it("quality/notion-contextゲート失敗時だけwriter・spec・checkpointをまとめて破棄する", () => {
    const removed: string[] = [];
    const files = ["writer.json", "publish-spec.json", "publish-checkpoint.json"];
    expect(invalidatePublishResumeFiles("✗ quality-gate: invalid", files, {
      exists: (file) => file !== "writer.json",
      remove: (file) => removed.push(file),
    })).toBe(true);
    expect(removed).toEqual(["publish-spec.json", "publish-checkpoint.json"]);
    expect(invalidatePublishResumeFiles("✗ create: timeout", files, {
      exists: () => true,
      remove: (file) => removed.push(file),
    })).toBe(false);
    expect(removed).toEqual(["publish-spec.json", "publish-checkpoint.json"]);
  });
  it("一時作業ディレクトリを失敗の有無にかかわらず全て削除する", async () => {
    const calls: Array<{ directory: string; options: { recursive: true; force: true } }> = [];
    const remove = async (directory: string, options: { recursive: true; force: true }) => {
      calls.push({ directory, options });
      if (directory.endsWith("research")) throw new Error("削除失敗");
    };

    await expect(
      cleanupDraftWorkDirs(["/tmp/research", "/tmp/writer"], remove),
    ).resolves.toBeUndefined();
    expect(calls).toEqual([
      { directory: "/tmp/research", options: { recursive: true, force: true } },
      { directory: "/tmp/writer", options: { recursive: true, force: true } },
    ]);
  });

  it("下書き投入後の通知失敗はpartialでthrowせず再送コマンドを警告する", async () => {
    const warnings: string[] = [];
    const result = await runDraftNotificationBestEffort({
      notifyPath: "/tmp/notify.json",
      notify: async () => {
        throw new Error("LINE API error");
      },
      warn: (message) => warnings.push(message),
    });
    expect(result).toMatchObject({ outcome: "partial", failedStage: "line-notify", success: false });
    expect(warnings).toEqual([
      expect.stringContaining("npm run growth:notify-drafts -- /tmp/notify.json"),
    ]);
  });

  it("下書き投入後の通知成功をsuccessとして返す", async () => {
    let notified = false;
    const warnings: string[] = [];

    const result = await runDraftNotificationBestEffort({
      notifyPath: "/tmp/notify.json",
      notify: async () => {
        notified = true;
      },
      warn: (message) => warnings.push(message),
    });
    expect(result).toMatchObject({ outcome: "success", success: true, completedStages: ["line-notify"] });
    expect(notified).toBe(true);
    expect(warnings).toEqual([]);
  });

  it("通知処理がError以外をrejectしても警告へ変換する", async () => {
    const warnings: string[] = [];
    const thrownValue: unknown = "LINE unavailable";

    const result = await runDraftNotificationBestEffort({
      notifyPath: "/tmp/notify.json",
      notify: () => {
        return Promise.reject(thrownValue);
      },
      warn: (message) => warnings.push(message),
    });
    expect(result.outcome).toBe("partial");
    expect(warnings[0]).toContain("LINE unavailable");
  });

  it("facility-contextのopenDateから実行時点の開業状態を決定する", () => {
    const facility = {
      name: "THE PICKLE BANG THEORY",
      openDate: "2026-04-17",
      location: ["市川市"],
      confirmed: ["屋内3面"],
      doNotWrite: ["24時間営業"],
      notes: "補足",
    };

    expect(buildFacilityResearchContext(facility, new Date("2026-04-16T12:00:00+09:00"))).toMatchObject({
      name: "THE PICKLE BANG THEORY",
      openDate: "2026-04-17",
      phase: "pre-open",
      phaseDays: 1,
      confirmed: ["屋内3面"],
      doNotWrite: ["24時間営業"],
      notes: "補足",
    });
    expect(buildFacilityResearchContext(facility, new Date("2026-04-18T12:00:00+09:00"))).toMatchObject({
      phase: "open",
      phaseDays: 1,
    });
    expect(buildFacilityResearchContext({
      name: facility.name,
      openDate: facility.openDate,
      location: facility.location,
      confirmed: facility.confirmed,
      doNotWrite: facility.doNotWrite,
    }, new Date("2026-04-18T12:00:00+09:00"))).not.toHaveProperty("notes");
  });

  it("記事テーマに関係する施設情報だけをリサーチと執筆へ渡す", () => {
    const facility = buildFacilityResearchContext({
      name: "THE PICKLE BANG THEORY",
      openDate: "2026-04-17",
      location: ["本八幡駅から徒歩1分"],
      confirmed: [
        "営業時間は6:00-23:00",
        "レンタルパドルがある",
        "HYROXエリアにSkiErgがある",
      ],
      doNotWrite: [
        "予約サービス名は断定しない",
        "HYROX担当コーチの未確認実績は書かない",
        "キャンペーン価格は確認せず書かない",
      ],
      notes: "全記事共通の長い運用メモ",
    }, new Date("2026-07-15T12:00:00+09:00"));

    const selected = selectRelevantFacilityContext(
      facility,
      "市川市でピックルボールができる場所を時間帯と予約方法で比べる",
    );
    expect(selected).toMatchObject({
      location: ["本八幡駅から徒歩1分"],
      confirmed: ["営業時間は6:00-23:00"],
      doNotWrite: ["予約サービス名は断定しない"],
    });
    expect(selected).not.toHaveProperty("notes");
    expect(selectRelevantFacilityContext(facility, "料金を比較する").location).toEqual([]);
  });

  it("執筆入力は生の一次情報メモを含めずResearchPacketだけを事実入力にする", () => {
    const writerInput = buildWriterInput({
      pageId: "page-1",
      title: "市川市ガイド",
      outline: "## 場所",
      audience: "初心者",
      searchIntent: "市川 場所",
      cta: "予約",
      primaryNotes: "未検証の生メモ",
      media: "コラム",
      articleType: "獲得",
      columnCategory: "compare",
      newsCategory: "",
      rebuildSourceId: "",
    }, "## 場所", { version: 1, facts: [] }, []);

    expect(writerInput).not.toHaveProperty("primaryNotes");
    expect(writerInput).toMatchObject({ facts: [], doNotWrite: [] });
  });

  it("Notionの承認済み入力だけを抽出する", () => {
    expect(
      draftInputFromPage(
        page({
          "タイトル案": { title: [{ plain_text: "市川市ガイド" }] },
          "構成案": { rich_text: [{ plain_text: "## 場所\n本文" }] },
          "狙う読者": { rich_text: [{ plain_text: "初心者" }] },
          "検索意図": { rich_text: [{ plain_text: "市川 場所" }] },
          "想定CTA": { rich_text: [{ plain_text: "予約" }] },
          "一次情報メモ": { rich_text: [{ plain_text: "メモ" }] },
          "媒体": { select: { name: "コラム" } },
          "記事タイプ": { multi_select: [{ name: "獲得" }] },
          "コラムカテゴリ": { select: { name: "compare" } },
          "再生成元下書きID": { rich_text: [{ plain_text: "column-old" }] },
          "下書き本文HTML": { rich_text: [{ plain_text: "読まない" }] },
        }),
      ),
    ).toEqual({
      pageId: "page-1",
      title: "市川市ガイド",
      outline: "## 場所\n本文",
      audience: "初心者",
      searchIntent: "市川 場所",
      cta: "予約",
      primaryNotes: "メモ",
      media: "コラム",
      articleType: "獲得",
      columnCategory: "compare",
      newsCategory: "",
      rebuildSourceId: "column-old",
    });
  });

  it("欠損・不正なNotionプロパティは安全な既定値にする", () => {
    expect(draftInputFromPage(page({
      "タイトル案": null,
      "構成案": { rich_text: [null, { plain_text: 42 }] },
      "媒体": { select: null },
      "記事タイプ": { multi_select: [null, { name: 42 }] },
      "コラムカテゴリ": "invalid",
    }))).toEqual({
      pageId: "page-1",
      title: "",
      outline: "",
      audience: "",
      searchIntent: "",
      cta: "",
      primaryNotes: "",
      media: "コラム",
      articleType: "",
      columnCategory: "",
      newsCategory: "",
      rebuildSourceId: "",
    });
  });

  it("記事タイプのselect形式と分割されたテキストも読み取る", () => {
    expect(draftInputFromPage(page({
      "タイトル案": { title: [{ plain_text: "市川" }, { plain_text: "ガイド" }] },
      "記事タイプ": { select: { name: " 認知 " } },
      "ニュースカテゴリ": { multi_select: [{ name: " メディア掲載 " }] },
    }))).toMatchObject({ title: "市川ガイド", articleType: "認知" });
    expect(draftInputFromPage(page({
      "ニュースカテゴリ": { multi_select: [{ name: " メディア掲載 " }] },
    }))).toMatchObject({ newsCategory: "メディア掲載" });
  });

  it("オブジェクト内のプロパティ型が不正でも空文字へ正規化する", () => {
    expect(draftInputFromPage(page({
      "タイトル案": { title: "invalid" },
      "媒体": { select: { name: 42 } },
      "記事タイプ": null,
      "コラムカテゴリ": { select: "invalid" },
    }))).toMatchObject({ title: "", media: "コラム", articleType: "", columnCategory: "" });
  });

  it("構成案の画像指示を最大3枚のmarkerとspecへ決定的に変換する", () => {
    const result = prepareOutlineImages([
      "## A",
      "[画像:宇宙人マスコット: コートを案内]",
      "## B",
      "[画像:比較・インフォグラフィック: 3つを比較 | 文字: 体育館・クラブ・専用施設]",
      "[画像:なし]",
    ].join("\n"));
    expect(result.outline).toContain("{{IMG:1}}");
    expect(result.outline).toContain("{{IMG:2}}");
    expect(result.outline).not.toContain("[画像:");
    expect(result.images).toEqual([
      { index: 1, style: "mascot", description: "コートを案内" },
      { index: 2, style: "infographic", description: "3つを比較", textSpec: "体育館・クラブ・専用施設" },
    ]);
  });

  it("不正な画像指示を除外し4枚目以降を生成しない", () => {
    const result = prepareOutlineImages([
      "通常行",
      "[画像:不明: 説明]",
      "[画像:おまかせ: ]",
      "[画像:おまかせ: 1]",
      "[画像:雰囲気イラスト: 2]",
      "[画像:手順・フロー図: 3]",
      "[画像:詳しい図解: 4]",
    ].join("\n"));
    expect(result.images).toHaveLength(3);
    expect(result.outline).toContain("通常行");
    expect(result.outline).not.toContain("説明");
    expect(result.outline).not.toContain(" 4");
  });

  it("モデル・プロンプト・入力の違いをキャッシュキーへ含める", () => {
    const base = { input: { a: 1 }, prompt: "p", model: { provider: "codex", model: "gpt-5.6-sol", effort: "medium" } };
    expect(stageCacheKey(base)).toBe(stageCacheKey(base));
    expect(stageCacheKey(base)).not.toBe(stageCacheKey({ ...base, prompt: "changed" }));
    expect(stageCacheKey(base)).not.toBe(stageCacheKey({ ...base, model: { ...base.model, effort: "high" } }));
    expect(stageCacheKey(["a", { b: 1 }])).toBe(stageCacheKey(["a", { b: 1 }]));
  });

  it("意図的な再生成は新attemptにし、同じattemptの障害再試行だけを再利用する", () => {
    const first = resolveDraftGenerationScope("column-old", null, () => "attempt-1");
    expect(first).toEqual({
      cacheScope: "rebuild:attempt-1",
      marker: { sourceId: "column-old", attemptId: "attempt-1" },
    });

    expect(resolveDraftGenerationScope("column-old", first.marker, () => "unused")).toEqual(first);
    expect(resolveDraftGenerationScope("column-other", first.marker, () => "attempt-2")).toEqual({
      cacheScope: "rebuild:attempt-2",
      marker: { sourceId: "column-other", attemptId: "attempt-2" },
    });
    expect(resolveDraftGenerationScope("", first.marker, () => "unused")).toEqual({
      cacheScope: "standard",
      marker: null,
    });

    expect(stageCacheKey({ input: "same", cacheScope: first.cacheScope })).not.toBe(
      stageCacheKey({ input: "same", cacheScope: "rebuild:attempt-2" }),
    );
  });

  it("publish-draft出力から下書きIDを必須で取り出す", () => {
    expect(publishedContentId("created contentId=column-123\n")).toBe("column-123");
    expect(() => publishedContentId("created without id")).toThrow(/contentId/);
  });

  it("Writer出力をキャッシュ可能にする前にリンクと画像markerを検証する", () => {
    const research: ResearchPacket = {
      version: 1,
      facts: [{
        id: "fact-1",
        statement: "公式ページの案内",
        role: "detail",
        sourceType: "official-site",
        source: "https://example.jp/official",
        sourceLabel: "公式ページ",
        isStatistic: undefined,
        isHealthClaim: undefined,
        publishedYear: undefined,
      }],
    };
    const base: WriterOutput = {
      slug: "ichikawa-guide",
      excerpt: "概要",
      bodyHtml: '<h2>場所</h2><p><a href="https://example.jp/official">公式ページ</a><!--FACT:fact-1-->。</p>{{IMG:1}}',
      usedFactIds: ["fact-1"],
    };

    const outline = "## 場所\n{{IMG:1}}";
    expect(() => validateWriterContract(base, research, outline)).not.toThrow();
    expect(() => validateWriterContract({ ...base, bodyHtml: '<h2>場所</h2><a href="https://invalid.example">未確認</a>{{IMG:1}}' }, research, outline)).toThrow(/確認済みでない/);
    expect(() => validateWriterContract({ ...base, bodyHtml: '<h2>場所</h2><a href="https://example.jp/official">1</a><a href="https://example.jp/official">2</a>{{IMG:1}}' }, research, outline)).toThrow(/重複/);
    expect(() => validateWriterContract({ ...base, bodyHtml: '<h2>場所</h2>{{IMG:2}}' }, research, outline)).toThrow(/プレースホルダー/);
    expect(parseValidatedWriterOutput(base, research, outline)).toMatchObject({
      ...base,
      bodyHtml: '<h2>場所</h2><p><a href="https://example.jp/official">公式ページ</a>。</p>{{IMG:1}}',
      factReferences: [{ factId: "fact-1", excerpt: "公式ページ", sectionPath: "場所" }],
    });
    expect(() => parseValidatedWriterOutput({
      ...base,
      bodyHtml: '<h2>場所</h2><p>公式ページ<!--FACT:fact-1-->。</p>{{IMG:2}}',
    }, research, outline)).toThrow(/プレースホルダー/);
  });

  it("本文画像markerを構成案と同じ見出し配下にだけ配置できる", () => {
    const research: ResearchPacket = { version: 1, facts: [] };
    const outline = "## 選び方\n{{IMG:1}}\n## 施設紹介\n### 設備\n{{IMG:2}}";
    const writer: WriterOutput = {
      slug: "guide",
      excerpt: "概要",
      bodyHtml: "<h2>選び方</h2><p>本文</p>{{IMG:1}}<h2>施設紹介</h2><h3>設備</h3>{{IMG:2}}",
      usedFactIds: [],
    };

    expect(() => validateWriterContract(writer, research, outline)).not.toThrow();
    expect(() => validateWriterContract({
      ...writer,
      bodyHtml: "<h2>選び方</h2><p>本文</p><h2>施設紹介</h2>{{IMG:1}}<h3>設備</h3>{{IMG:2}}",
    }, research, outline)).toThrow(/配置見出し/);
  });

  it("worker logへ記事のtarget-page-idを渡す", () => {
    expect(workerLogTargetFields("page-1")).toEqual({
      "target-type": "article",
      "target-page-id": "page-1",
    });
  });

  it("WriterOutputと使用factから既存publish specを組み立てる", () => {
    const research: ResearchPacket = {
      version: 1,
      facts: [{
        id: "fact-1",
        statement: "公式事実",
        role: "detail",
        sourceType: "official-site",
        source: "https://example.jp/official",
        sourceLabel: "公式ページ",
        isStatistic: undefined,
        isHealthClaim: undefined,
        publishedYear: undefined,
      }],
    };
    const writer: ValidatedWriterOutput = {
      slug: "ichikawa-guide",
      excerpt: "概要",
      bodyHtml: "<h2>場所</h2><p>本文</p>",
      usedFactIds: ["fact-1"],
      factReferences: [{
        factId: "fact-1",
        excerpt: "公式事実",
        sectionPath: "場所",
        container: "p",
        containerIndex: 1,
        claimKinds: ["proper-noun"],
      }],
    };
    const spec = assemblePublishSpec({
      input: {
        pageId: "page-1",
        title: "市川市ガイド",
        outline: "## 場所",
        audience: "初心者",
        searchIntent: "市川 場所",
        cta: "予約",
        primaryNotes: "",
        media: "コラム",
        articleType: "獲得",
        columnCategory: "compare",
        newsCategory: "",
        rebuildSourceId: "",
      },
      writer,
      research,
      images: [{ index: 1, style: "auto", description: "比較" }],
    });
    expect(spec).toMatchObject({
      media: "コラム",
      payload: {
        title: "市川市ガイド",
        slug: "ichikawa-guide",
        excerpt: "概要",
        bodyHtml: writer.bodyHtml,
        category: "compare",
      },
      eyecatchAction: "pending",
      rebuildSourceId: "",
      notion: { pageId: "page-1", property: "ステータス", value: "下書き作成済み" },
      sourceLedger: [{
        source: "https://example.jp/official",
        confirmedFacts: ["公式事実"],
        factReferences: [{ factId: "fact-1", excerpt: "公式事実", sectionPath: "場所", recheckBeforePublish: false }],
      }],
    });
  });

  it("ニュース用specと分類なしのコラムspecを組み立てる", () => {
    const research: ResearchPacket = { version: 1, facts: [] };
    const writer: ValidatedWriterOutput = {
      slug: "news",
      excerpt: "概要",
      bodyHtml: "<p>本文</p>",
      usedFactIds: [],
      factReferences: [],
    };
    const baseInput = {
      pageId: "page-1",
      title: "お知らせ",
      outline: "## 内容",
      audience: "",
      searchIntent: "",
      cta: "",
      primaryNotes: "",
      articleType: "",
      columnCategory: "",
      newsCategory: "",
      rebuildSourceId: "",
    };
    expect(assemblePublishSpec({
      input: { ...baseInput, media: "ニュース" }, writer, research, images: [],
    })).toMatchObject({ media: "ニュース", payload: { category: ["お知らせ"] } });
    expect(assemblePublishSpec({
      input: { ...baseInput, media: "ニュース", articleType: "イベント" }, writer, research, images: [],
    })).toMatchObject({ payload: { category: ["イベント情報"] } });
    expect(assemblePublishSpec({
      input: { ...baseInput, media: "ニュース", title: "夏の入会キャンペーン" }, writer, research, images: [],
    })).toMatchObject({ payload: { category: ["キャンペーン"] } });
    expect(assemblePublishSpec({
      input: { ...baseInput, media: "ニュース", title: "テレビ取材のお知らせ" }, writer, research, images: [],
    })).toMatchObject({ payload: { category: ["メディア掲載"] } });
    expect(assemblePublishSpec({
      input: { ...baseInput, media: "ニュース", outline: "## 体験会の概要" }, writer, research, images: [],
    })).toMatchObject({ payload: { category: ["イベント情報"] } });
    expect(assemblePublishSpec({
      input: { ...baseInput, media: "ニュース", newsCategory: "メディア掲載" }, writer, research, images: [],
    })).toMatchObject({ payload: { category: ["メディア掲載"] } });
    expect(assemblePublishSpec({
      input: { ...baseInput, media: "コラム" }, writer, research, images: [],
    })).toMatchObject({ media: "コラム", payload: { title: "お知らせ" } });
  });

  it("本文起因の投入失敗だけWriterキャッシュを破棄する", () => {
    expect(shouldInvalidateWriterCacheForPublishFailure("✗ quality-gate: AI免責文がありません")).toBe(true);
    expect(shouldInvalidateWriterCacheForPublishFailure("✗ notion-context: 構成案ゲート不合格(投入中断): H2不一致")).toBe(true);
    expect(shouldInvalidateWriterCacheForPublishFailure("✗ body-images: 画像生成APIエラー")).toBe(false);
    expect(shouldInvalidateWriterCacheForPublishFailure("✗ create: microCMS APIエラー")).toBe(false);
  });
});
