/**
 * グロース各フェーズのプロンプト確認(承認画面「プロンプト」タブ)の純ロジック。
 *
 * `scripts/growth/prompts/*.md` のファイル名に、人が読みやすいラベル・パイプライン上の
 * グループ・並び順・「いつ動くか」の一行説明を対応づけるレジストリと、ディスクから読んだ
 * ファイル群をグループ単位に整形する `assemblePromptGroups` を提供する。
 *
 * 方針:
 *  - 表示はあくまで**デプロイ時点のリポジトリ内容**(静的テンプレ。実行時に差し込まれる
 *    Notion 構成案などは含まない)。前提情報(facility-context)は別格でピン留めする。
 *  - レジストリ未登録の .md も「その他」グループへ自動的に拾う(沈黙させない=新フェーズの
 *    追加忘れでも画面から消えない)。
 *
 * DOM/IO 非依存。ファイル読み込み(IO)は API ルート側が担い、結果をこの純関数へ渡す。
 */

/** 1 フェーズ(=1 プロンプトファイル)の表示メタ情報。 */
export interface PromptPhaseMeta {
  /** プロンプトのファイル名(例: "drafts.md")。 */
  filename: string;
  /** 人が読むラベル(例: "下書き生成")。 */
  label: string;
  /** パイプライン上のグループ(例: "執筆")。 */
  group: string;
  /** 同一グループ内の並び順(昇順)。 */
  order: number;
  /** このフェーズがいつ動くかの一行説明。 */
  whenItRuns: string;
}

/** ディスクから読み込んだプロンプトファイル(ファイル名＋本文)。 */
export interface PromptFile {
  filename: string;
  content: string;
}

/** 表示用に本文を載せたフェーズ。 */
export interface PromptPhase extends PromptPhaseMeta {
  content: string;
}

/** 1 グループとその配下フェーズ。 */
export interface PromptGroup {
  group: string;
  phases: PromptPhase[];
}

/**
 * グループの表示順。フェーズ(パイプライン順)→ AI が参照する資料 → "その他" の順。
 * "その他"(未登録ファイルの受け皿)は常に最後。
 */
export const PROMPT_GROUP_ORDER: readonly string[] = [
  "分析",
  "施策",
  "執筆",
  "修正・推敲",
  "画像生成",
  "参考ドキュメント",
  "文体の例",
  "運用・セットアップ",
  "その他",
];

/** 未登録 .md を割り当てるグループ名(順序表の末尾と一致)。 */
const FALLBACK_GROUP = "その他";

/**
 * ファイル名 → 表示メタの対応表。`scripts/growth/prompts/` の各 .md と、起動ランチャー
 * (run.mjs)のモード定義に対応する。新フェーズを追加したらここにも 1 行足すと整って表示される
 * (足し忘れても「その他」へ自動的に出る)。
 */
export const PROMPT_REGISTRY: readonly PromptPhaseMeta[] = [
  {
    filename: "weekly.md",
    label: "週次分析",
    group: "分析",
    order: 1,
    whenItRuns: "週次の分析→Notion レポート＋施策提案を作るとき(growth:weekly)",
  },
  {
    filename: "initiatives.md",
    label: "施策の実行案づくり",
    group: "施策",
    order: 1,
    whenItRuns: "承認した施策を Notion 本文に文案/仕様書として書き起こすとき(growth:initiatives)",
  },
  {
    filename: "drafts.md",
    label: "下書き生成",
    group: "執筆",
    order: 1,
    whenItRuns: "承認済みの記事ネタを microCMS 下書きに生成するとき(growth:drafts)",
  },
  {
    filename: "revise-outline.md",
    label: "構成案の修正",
    group: "修正・推敲",
    order: 1,
    whenItRuns: "承認画面で構成案やタイトルに修正指示を出したとき(growth:revise)",
  },
  {
    filename: "comment-revise.md",
    label: "本文コメント修正",
    group: "修正・推敲",
    order: 2,
    whenItRuns: "本文にインラインコメントで修正を依頼したとき(growth:comment-revise)",
  },
  {
    filename: "advise.md",
    label: "スタイリング・アドバイス",
    group: "修正・推敲",
    order: 3,
    whenItRuns: "下書きにスタイリング・アドバイスを依頼したとき(read-only / growth:advise)",
  },
  {
    filename: "advise-apply.md",
    label: "アドバイスの本文反映",
    group: "修正・推敲",
    order: 4,
    whenItRuns: "アドバイスの修正案を採用して本文へ反映するとき(growth:apply)",
  },
  {
    filename: "decorate.md",
    label: "装飾の提案",
    group: "修正・推敲",
    order: 5,
    whenItRuns: "下書きに装飾(注記/強調など)の提案を依頼したとき(growth:decorate)",
  },
  {
    filename: "regen-eyecatch.md",
    label: "アイキャッチ再生成",
    group: "画像生成",
    order: 1,
    whenItRuns: "アイキャッチの AI 再生成を依頼したとき(growth:regen)",
  },
  {
    filename: "regen-body-image.md",
    label: "本文画像の再生成",
    group: "画像生成",
    order: 2,
    whenItRuns: "本文画像の AI 再生成を依頼したとき(growth:regen-body)",
  },
  // ここから先は、各フェーズのプロンプトが「参照する資料」(指示書ではなく素材)。
  {
    filename: "CLAUDE.md",
    label: "プロジェクト規約（CLAUDE.md）",
    group: "参考ドキュメント",
    order: 0,
    whenItRuns: "claude -p が毎回自動ロードするプロジェクト全体の規約・前提",
  },
  {
    filename: "growth-article-style.md",
    label: "文体・構成の正典",
    group: "参考ドキュメント",
    order: 1,
    whenItRuns: "全フェーズが従う文体・構成のルール(style-guide)",
  },
  {
    filename: "ai-news-prompt.md",
    label: "本文HTMLの許可ルール",
    group: "参考ドキュメント",
    order: 2,
    whenItRuns: "本文 HTML で使える許可タグ・属性・クラス(§3)。下書き/修正で参照",
  },
  {
    filename: "growth-weekly-runbook.md",
    label: "運用ランブック",
    group: "参考ドキュメント",
    order: 3,
    whenItRuns: "週次〜公開の運用手順。週次/下書き/施策で参照",
  },
  {
    filename: "example-trend.md",
    label: "記事例：トレンド",
    group: "文体の例",
    order: 1,
    whenItRuns: "下書き生成時に文体を真似る few-shot 例(トレンド系)",
  },
  {
    filename: "example-beginner-local.md",
    label: "記事例：初心者×地域",
    group: "文体の例",
    order: 2,
    whenItRuns: "下書き生成時に文体を真似る few-shot 例(初心者×地域系)",
  },
  {
    filename: "ng-ok-examples.md",
    label: "NG→OK 対比例",
    group: "文体の例",
    order: 3,
    whenItRuns: "下書きの編集者ゲートで参照する、ありがちな事故と直し方(§13/§14/§15/§7)",
  },
  // この分析機能(グロースループ)を動かすための運用・セットアップ手順(人間向け資料)。
  {
    filename: "growth-windows-setup.md",
    label: "常時稼働PCのセットアップ",
    group: "運用・セットアップ",
    order: 1,
    whenItRuns: "週次/修正ループ等を常時稼働させる PC の初期設定手順",
  },
  {
    filename: "growth-line-approval-setup.md",
    label: "LINE承認導線のセットアップ",
    group: "運用・セットアップ",
    order: 2,
    whenItRuns: "承認画面への導線・LINE 通知の設定手順",
  },
  {
    filename: "news-admin-manual.md",
    label: "microCMS手動運用マニュアル",
    group: "運用・セットアップ",
    order: 3,
    whenItRuns: "公開先 microCMS の手動運用(下書き/公開/メディア)マニュアル",
  },
];

const REGISTRY_BY_FILENAME = new Map<string, PromptPhaseMeta>(
  PROMPT_REGISTRY.map((meta) => [meta.filename, meta]),
);

/** 未登録ファイルの表示メタ。ラベルはファイル名、グループは「その他」、末尾に並べる。 */
function fallbackMeta(filename: string): PromptPhaseMeta {
  return {
    filename,
    label: filename,
    group: FALLBACK_GROUP,
    order: Number.MAX_SAFE_INTEGER,
    whenItRuns: "(レジストリ未登録のプロンプト。promptRegistry.ts に登録すると整って表示されます)",
  };
}

/**
 * ディスクから読んだプロンプトファイル群を、グループ単位に整形して返す。
 * - グループは PROMPT_GROUP_ORDER の順、グループ内は order 昇順(同 order はファイル名昇順)。
 * - 未登録 .md は「その他」グループへ。
 * - フェーズの無いグループは結果に含めない。
 */
export function assemblePromptGroups(files: readonly PromptFile[]): PromptGroup[] {
  const phases: PromptPhase[] = files.map((f) => {
    const meta = REGISTRY_BY_FILENAME.get(f.filename) ?? fallbackMeta(f.filename);
    return { ...meta, content: f.content };
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
    list.sort((a, b) => a.order - b.order || a.filename.localeCompare(b.filename));
    result.push({ group, phases: list });
  }
  return result;
}
