/**
 * グロース各フェーズのプロンプト確認(承認画面「プロンプト」タブ)の純ロジック。
 *
 * 表示対象のファイル path・表示メタ・情報設計をこの単一マニフェストに集約する。
 * API ルートはここに登録された repo 相対 path をキーに読み込み、UI も同じ path を
 * 選択キー・Markdown 相対リンク解決・URL query(`doc`)に使う。
 */

export type PromptSourceKind = "prompt" | "shared" | "example" | "reference";

/** 1 資料(=1 プロンプト/参考資料ファイル)の表示メタ情報。 */
export interface PromptPhaseMeta {
  /** repo ルートからの相対 path。選択キーとして一意に使う。 */
  path: string;
  /** basename。表示補助と既存テスト互換のため保持する。 */
  filename: string;
  /** 人が読むラベル。 */
  label: string;
  /** 表示カテゴリ。 */
  group: string;
  /** 同一グループ内の並び順(昇順)。 */
  order: number;
  /** 何のための資料か。 */
  purpose: string;
  /** 主な対象工程。 */
  stage: string;
  /** この資料がいつ使われるかの一行説明。 */
  whenItRuns: string;
  /** どこから読み込む資料か。API の読み込み方法で使う。 */
  sourceKind: PromptSourceKind;
}

/** ディスクから読み込んだプロンプト/資料ファイル(path＋本文)。 */
export interface PromptFile {
  path: string;
  filename: string;
  content: string;
}

/** 表示用に本文を載せた資料。 */
export interface PromptPhase extends PromptPhaseMeta {
  content: string;
}

/** 1 グループとその配下資料。 */
export interface PromptGroup {
  group: string;
  phases: PromptPhase[];
}

/**
 * 情報設計の大分類。常時全展開せず、UI 側でカテゴリ切替/折りたたみに使う。
 * "その他"(未登録ファイルの受け皿)は常に最後。
 */
export const PROMPT_GROUP_ORDER: readonly string[] = [
  "実行プロンプト",
  "正典・共通ルール",
  "運用ガイド",
  "計測・学習",
  "文体例",
  "その他",
];

/** 未登録 .md を割り当てるグループ名(順序表の末尾と一致)。 */
const FALLBACK_GROUP = "その他";

function basenameOf(repoPath: string): string {
  /* istanbul ignore next -- @preserve split は文字列入力に対して常に1要素以上を返す */
  return repoPath.split("/").pop() ?? repoPath;
}

function meta(input: Omit<PromptPhaseMeta, "filename">): PromptPhaseMeta {
  return { ...input, filename: basenameOf(input.path) };
}

/**
 * path → 表示メタの対応表。`scripts/growth/prompts/**`、AI が参照する shared/examples、
 * docs/operations 配下の正典・運用資料、AGENTS.md/CLAUDE.md を同じマニフェストで扱う。
 */
export const PROMPT_REGISTRY: readonly PromptPhaseMeta[] = [
  meta({
    path: "scripts/growth/prompts/weekly.md",
    label: "週次分析",
    group: "実行プロンプト",
    order: 10,
    purpose: "週次の分析結果、Notion レポート、施策提案を生成する実行テンプレート",
    stage: "週次分析",
    whenItRuns: "週次の分析→Notion レポート＋施策提案を作るとき(growth:weekly)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/initiatives.md",
    label: "施策の実行案づくり",
    group: "実行プロンプト",
    order: 20,
    purpose: "承認済み施策を Notion 本文の実行案・仕様に書き起こす",
    stage: "施策成果物化",
    whenItRuns: "承認した施策を Notion 本文に文案/仕様書として書き起こすとき(growth:initiatives)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/drafts.md",
    label: "下書き生成",
    group: "実行プロンプト",
    order: 30,
    purpose: "承認済みの記事ネタを microCMS 下書きHTMLへ変換する",
    stage: "記事下書き生成",
    whenItRuns: "承認済みの記事ネタを microCMS 下書きに生成するとき(growth:drafts)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/revise-outline.md",
    label: "構成案の修正",
    group: "実行プロンプト",
    order: 40,
    purpose: "構成案・タイトルへの人間の修正指示を反映した差分案を作る",
    stage: "構成案・タイトル修正",
    whenItRuns: "承認画面で構成案やタイトルに修正指示を出したとき(growth:revise)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/comment-revise.md",
    label: "本文コメント修正",
    group: "実行プロンプト",
    order: 50,
    purpose: "本文インラインコメントから対象ブロックの before/after 修正案を作る",
    stage: "本文コメント修正",
    whenItRuns: "本文にインラインコメントで修正を依頼したとき(growth:comment-revise)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/advise.md",
    label: "スタイリング・アドバイス",
    group: "実行プロンプト",
    order: 60,
    purpose: "下書き本文を文体・構成ルールに照らして read-only で診断する",
    stage: "記事アドバイス",
    whenItRuns: "下書きにスタイリング・アドバイスを依頼したとき(read-only / growth:advise)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/advise-apply.md",
    label: "アドバイスの本文反映",
    group: "実行プロンプト",
    order: 70,
    purpose: "採用済みアドバイスから本文反映用の局所修正案を作る",
    stage: "アドバイス反映",
    whenItRuns: "アドバイスの修正案を採用して本文へ反映するとき(growth:apply)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/decorate.md",
    label: "装飾の提案",
    group: "実行プロンプト",
    order: 80,
    purpose: "本文ブロック単位で注記・強調などの装飾提案メタデータを作る",
    stage: "装飾提案",
    whenItRuns: "下書きに装飾(注記/強調など)の提案を依頼したとき(growth:decorate)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/image-prompt.md",
    label: "画像プロンプト設計",
    group: "実行プロンプト",
    order: 85,
    purpose: "初回下書きの画像生成モデルへ渡す行為・スタイル・説明を独立モデルで設計する",
    stage: "画像プロンプト設計",
    whenItRuns: "下書き投入specを作成した後、画像生成前に実行する(growth:image-prompt)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/regen-eyecatch.md",
    label: "アイキャッチ再生成",
    group: "実行プロンプト",
    order: 90,
    purpose: "人間の指示をアイキャッチ再生成用の画像生成指示へ変換する",
    stage: "アイキャッチ画像再生成",
    whenItRuns: "アイキャッチの AI 再生成を依頼したとき(growth:regen)",
    sourceKind: "prompt",
  }),
  meta({
    path: "scripts/growth/prompts/regen-body-image.md",
    label: "本文画像の再生成",
    group: "実行プロンプト",
    order: 100,
    purpose: "対象本文画像の差し替えに使う画像生成・アップロード手順を実行する",
    stage: "本文画像再生成",
    whenItRuns: "本文画像の AI 再生成を依頼したとき(growth:regen-body)",
    sourceKind: "prompt",
  }),

  meta({
    path: "CLAUDE.md",
    label: "プロジェクト規約（CLAUDE.md）",
    group: "正典・共通ルール",
    order: 1,
    purpose: "プロジェクト全体の規約・前提・グロース索引",
    stage: "全工程",
    whenItRuns: "Claude Code / headless agent が参照するプロジェクト全体の規約・前提",
    sourceKind: "reference",
  }),
  meta({
    path: "AGENTS.md",
    label: "プロジェクト規約（AGENTS.md）",
    group: "正典・共通ルール",
    order: 2,
    purpose: "Codex/agent 向けのプロジェクト規約・前提・グロース索引",
    stage: "全工程",
    whenItRuns: "Codex やエージェント実装者が参照するプロジェクト全体の規約・前提",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth/00-canon.md",
    label: "グロース正典",
    group: "正典・共通ルール",
    order: 3,
    purpose: "絶対禁止事項、正典の優先順位、工程別AIモデル設定のルール",
    stage: "全工程",
    whenItRuns: "全グロース工程の共通正典として参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth-article-style.md",
    label: "文体・構成の正典",
    group: "正典・共通ルール",
    order: 10,
    purpose: "記事の文体・構成・NG・画像ルールの正典",
    stage: "記事生成・修正",
    whenItRuns: "全フェーズが従う文体・構成のルール(style-guide)",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/ai-news-prompt.md",
    label: "本文HTMLの許可ルール",
    group: "正典・共通ルール",
    order: 20,
    purpose: "microCMS本文HTMLで許可するタグ・属性・クラスを定義する",
    stage: "下書き生成・本文修正",
    whenItRuns: "本文 HTML で使える許可タグ・属性・クラス。下書き/修正で参照",
    sourceKind: "reference",
  }),
  meta({
    path: "scripts/growth/prompts/shared/article-idea.md",
    label: "記事ネタ案作成ルール",
    group: "正典・共通ルール",
    order: 30,
    purpose: "記事ネタ案の構造、採用条件、避けるべき題材を定義する",
    stage: "週次分析・記事ネタ化",
    whenItRuns: "週次分析や承認済みコンテンツ施策から記事ネタ案を作るときに参照",
    sourceKind: "shared",
  }),

  meta({
    path: "docs/operations/growth/01-setup-guide.md",
    label: "初期構築ガイド",
    group: "運用ガイド",
    order: 10,
    purpose: "自宅PC・Vercel・Notion・microCMSの初期設定手順",
    stage: "初期構築",
    whenItRuns: "環境構築、DRYRUN、初回疎通確認のときに参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth/10-operator-guide.md",
    label: "日常運用ガイド",
    group: "運用ガイド",
    order: 20,
    purpose: "週次から公開までの人間向け運用手順",
    stage: "日常運用",
    whenItRuns: "週次サイクル、承認、下書き、公開判断の手順確認で参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth/20-draft.md",
    label: "下書きモード運用",
    group: "運用ガイド",
    order: 30,
    purpose: "下書き生成、本文画像、手動リッチ編集の運用詳細",
    stage: "下書き生成・編集",
    whenItRuns: "下書き生成や手動編集まわりの挙動確認で参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth/30-loops.md",
    label: "pull型AIループ",
    group: "運用ガイド",
    order: 40,
    purpose: "修正・画像再生成・アドバイス・装飾などのpull型ループ一覧",
    stage: "修正・再生成ループ",
    whenItRuns: "常時稼働PCの各ループの起動/トラブルシュートで参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth/40-notion-props.md",
    label: "Notionプロパティ一覧",
    group: "運用ガイド",
    order: 50,
    purpose: "記事ネタ案DBに必要なプロパティと欠落耐性を確認する",
    stage: "Notion設定",
    whenItRuns: "Notion DB 設計、欠落プロパティ確認、運用追加時に参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth-weekly-runbook.md",
    label: "運用ランブック",
    group: "運用ガイド",
    order: 60,
    purpose: "週次〜公開の旧ランブック兼詳細手順",
    stage: "週次運用",
    whenItRuns: "週次〜公開の運用手順。週次/下書き/施策で参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/news-admin-manual.md",
    label: "microCMS手動運用マニュアル",
    group: "運用ガイド",
    order: 70,
    purpose: "公開先 microCMS の手動操作、公開、メディア運用を確認する",
    stage: "microCMS運用",
    whenItRuns: "公開先 microCMS の手動運用(下書き/公開/メディア)マニュアル",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/columns/setup-manual.md",
    label: "コラム運用セットアップ",
    group: "運用ガイド",
    order: 80,
    purpose: "コラム運用のセットアップ手順と周辺設定を確認する",
    stage: "コラム運用",
    whenItRuns: "コラム運用の初期設定や手順確認で参照",
    sourceKind: "reference",
  }),

  meta({
    path: "scripts/growth/prompts/shared/growth-goals.md",
    label: "グロース目標・週次分析基準",
    group: "計測・学習",
    order: 5,
    purpose: "予約ファネル、提案品質、週次判断基準を定義する",
    stage: "週次分析・計測",
    whenItRuns: "週次分析で予約ファネルのボトルネックと提案品質を判断するときに参照",
    sourceKind: "shared",
  }),
  meta({
    path: "docs/operations/growth/50-publish-metrics.md",
    label: "公開キュー・計測ループ",
    group: "計測・学習",
    order: 10,
    purpose: "公開キュー、予約公開、GA4成績ボードの運用を確認する",
    stage: "公開・計測",
    whenItRuns: "公開判断、予約公開、公開後の成績確認で参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth/60-kpi-tree.md",
    label: "KPIツリー",
    group: "計測・学習",
    order: 20,
    purpose: "グロース施策のKPI分解と計測観点を整理する",
    stage: "分析・学習",
    whenItRuns: "分析指標や提案の優先順位を確認するときに参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth/70-self-tuning.md",
    label: "セルフチューニング",
    group: "計測・学習",
    order: 30,
    purpose: "学習ログと自己改善ループの運用方針を確認する",
    stage: "学習・改善",
    whenItRuns: "学習ログや自己改善提案の扱いを確認するときに参照",
    sourceKind: "reference",
  }),
  meta({
    path: "docs/operations/growth/worker-observability.md",
    label: "Worker運用監視",
    group: "計測・学習",
    order: 40,
    purpose: "常時稼働PC workerの状態、ログ、異常検知の見方を確認する",
    stage: "運用監視",
    whenItRuns: "worker 状態・失敗・リコンサイル結果を確認するときに参照",
    sourceKind: "reference",
  }),

  meta({
    path: "scripts/growth/prompts/examples/example-trend.md",
    label: "記事例：トレンド",
    group: "文体例",
    order: 10,
    purpose: "トレンド系記事の文体 few-shot",
    stage: "下書き生成",
    whenItRuns: "下書き生成時に文体を真似る few-shot 例(トレンド系)",
    sourceKind: "example",
  }),
  meta({
    path: "scripts/growth/prompts/examples/example-beginner-local.md",
    label: "記事例：初心者×地域",
    group: "文体例",
    order: 20,
    purpose: "初心者×地域系記事の文体 few-shot",
    stage: "下書き生成",
    whenItRuns: "下書き生成時に文体を真似る few-shot 例(初心者×地域系)",
    sourceKind: "example",
  }),
  meta({
    path: "scripts/growth/prompts/examples/example-scene-first.md",
    label: "記事例：場面起点",
    group: "文体例",
    order: 30,
    purpose: "場面起点・逆説系記事の文体 few-shot",
    stage: "下書き生成",
    whenItRuns: "下書き生成時に文体を真似る few-shot 例(場面起点・逆説)",
    sourceKind: "example",
  }),
  meta({
    path: "scripts/growth/prompts/examples/example-fear-relief.md",
    label: "記事例：不安解消",
    group: "文体例",
    order: 40,
    purpose: "不安解消型記事の文体 few-shot",
    stage: "下書き生成",
    whenItRuns: "下書き生成時に文体を真似る few-shot 例(不安解消型)",
    sourceKind: "example",
  }),
  meta({
    path: "scripts/growth/prompts/examples/example-asset-rule.md",
    label: "記事例：資産型",
    group: "文体例",
    order: 50,
    purpose: "資産型記事の文体 few-shot",
    stage: "下書き生成",
    whenItRuns: "下書き生成時に文体を真似る few-shot 例(資産型)",
    sourceKind: "example",
  }),
  meta({
    path: "scripts/growth/prompts/examples/ng-ok-examples.md",
    label: "NG→OK 対比例",
    group: "文体例",
    order: 60,
    purpose: "ありがちな事故と修正例を示す編集者ゲート用 few-shot",
    stage: "編集者ゲート",
    whenItRuns: "下書きの編集者ゲートで参照する、ありがちな事故と直し方",
    sourceKind: "example",
  }),
];

export const PROMPT_REGISTRY_BY_PATH = new Map<string, PromptPhaseMeta>(
  PROMPT_REGISTRY.map((item) => [item.path, item]),
);

export const PROMPT_REFERENCE_DOCS: readonly PromptPhaseMeta[] = PROMPT_REGISTRY.filter(
  (item) => item.sourceKind === "reference",
);

/** 未登録ファイルの表示メタ。ラベルはファイル名、グループは「その他」、末尾に並べる。 */
function fallbackMeta(repoPath: string): PromptPhaseMeta {
  const filename = basenameOf(repoPath);
  return {
    path: repoPath,
    filename,
    label: filename,
    group: FALLBACK_GROUP,
    order: Number.MAX_SAFE_INTEGER,
    purpose: "マニフェスト未登録の資料です。",
    stage: "未分類",
    whenItRuns: "(レジストリ未登録の資料。promptRegistry.ts に登録すると整って表示されます)",
    sourceKind: "reference",
  };
}

/**
 * ディスクから読んだプロンプトファイル群を、グループ単位に整形して返す。
 * - グループは PROMPT_GROUP_ORDER の順、グループ内は order 昇順。
 * - 未登録 .md は「その他」グループへ。
 * - フェーズの無いグループは結果に含めない。
 */
export function assemblePromptGroups(files: readonly PromptFile[]): PromptGroup[] {
  const phases: PromptPhase[] = files.map((file) => {
    const metaForPath = PROMPT_REGISTRY_BY_PATH.get(file.path) ?? fallbackMeta(file.path);
    return { ...metaForPath, filename: file.filename, content: file.content };
  });

  const byGroup = new Map<string, PromptPhase[]>();
  for (const phase of phases) {
    const list = byGroup.get(phase.group) ?? [];
    list.push(phase);
    byGroup.set(phase.group, list);
  }

  const result: PromptGroup[] = [];
  for (const group of PROMPT_GROUP_ORDER) {
    const list = byGroup.get(group);
    if (!list || list.length === 0) continue;
    list.sort(
      (a, b) =>
        a.order - b.order ||
        a.filename.localeCompare(b.filename) ||
        a.path.localeCompare(b.path),
    );
    result.push({ group, phases: list });
  }
  return result;
}
