// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PROMPT_REGISTRY } from "./promptRegistry";

const PROMPTS_DIR = path.resolve("scripts/growth/prompts");
const RUNBOOK_PATH = path.resolve("docs/operations/growth-weekly-runbook.md");
const OPERATOR_GUIDE_PATH = path.resolve("docs/operations/growth/10-operator-guide.md");
const NOTION_PROPS_PATH = path.resolve("docs/operations/growth/40-notion-props.md");
const KPI_TREE_PATH = path.resolve("docs/operations/growth/60-kpi-tree.md");

describe("週次分析の予約率中心プロンプト", () => {
  const weekly = readFileSync(path.join(PROMPTS_DIR, "weekly.md"), "utf-8");
  const goals = readFileSync(path.join(PROMPTS_DIR, "shared/growth-goals.md"), "utf-8");
  const articleIdea = readFileSync(path.join(PROMPTS_DIR, "shared/article-idea.md"), "utf-8");
  const runbook = readFileSync(RUNBOOK_PATH, "utf-8");
  const operatorGuide = readFileSync(OPERATOR_GUIDE_PATH, "utf-8");
  const notionProps = readFileSync(NOTION_PROPS_PATH, "utf-8");
  const kpiTree = readFileSync(KPI_TREE_PATH, "utf-8");

  it("週次プロンプトが共通の目標・分析基準を参照する", () => {
    expect(weekly).toContain("scripts/growth/prompts/shared/growth-goals.md");
    expect(weekly).toContain("最大3件");
    expect(weekly).toContain("反証材料");
    expect(weekly).toContain("記事が有効");
  });

  it("公開記事0件では実データに基づくコールドスタート実験枠を1件だけ許可する", () => {
    expect(weekly).toContain("コールドスタート実験枠");
    expect(weekly).toContain("公開済み記事が0件");
    expect(weekly).toContain("生きている記事案も0件");
    expect(weekly).toContain("最大1件");
    expect(weekly).toContain("GSC");
    expect(weekly).toContain("観測中の実験記事");
    expect(weekly).toContain("28日");
    expect(weekly).toContain("派生案を出さない");
  });

  it("共通基準が予約ファネルと実指標・代理指標を区別する", () => {
    expect(goals).toContain("認知 → 興味 → 予約意図 → 予約完了 → コート稼働 → 再予約・継続");
    expect(goals).toContain("コート予約率 = 予約済みコート枠 ÷ 販売可能コート枠");
    expect(goals).toContain("予約転換率 = 予約完了数 ÷ 予約ページ訪問数");
    expect(goals).toContain("予約意図率 = `/reserve` 到達数 ÷ サイト訪問数");
    expect(goals).toContain("比較データ不足");
    expect(goals).toContain("日本一");
  });

  it("実予約を優先しイベント別CTAを予約数から分離する", () => {
    expect(weekly).toContain("ga4.ctaEvents");
    expect(weekly).toContain("keyEvents合計を予約数とみなさない");
    expect(weekly).toContain("freshな記事帰属実予約");
    expect(weekly).toContain("欠損または古い場合だけ");
    expect(weekly).toContain("LINE・Instagram・その他CTA");
    expect(goals).toContain("reservation_click");
    expect(goals).toContain("reserve_entry_click");
    expect(goals).toContain("実予約");
  });

  it("予約件数の手入力を週次分析の入力として案内しない", () => {
    expect(weekly).not.toContain("予約件数/LINE友だち数");
    expect(weekly).not.toContain("同週のオーナー手入力");
    expect(goals).not.toContain("または同週のオーナー手入力");
    expect(operatorGuide).toContain("予約件数は手入力しない");
    expect(notionProps).toContain("予約件数は手入力しない");
    expect(kpiTree).toContain("予約件数は手入力しない");
    expect(kpiTree).not.toContain("予約サービスCSVまたは同週手入力");
  });

  it("LaBOLA予約導線を参考値として施策・記事の選択に使う", () => {
    expect(weekly).toContain("reservationFunnel");
    expect(weekly).toContain("計測開始から7日未満");
    expect(weekly).toContain("参考値");
    expect(weekly).toContain("入力後の離脱");
    expect(weekly).toContain("記事ではなく予約画面や操作説明");
    expect(weekly).toContain("料金変更");
    expect(weekly).toContain("セッション数");
    expect(weekly).toContain("離脱人数・離脱率とは扱わない");
    expect(weekly).toContain("entryMeasurementStatus=unavailable");
    expect(weekly).toContain("流入0件とは扱わない");
  });

  it("記事タイプを成功率・母数・未判定率・観測条件のセットで読む", () => {
    expect(weekly).toContain("成功率・判定済み母数・未判定率");
    expect(weekly).toContain("判定済み3本未満");
    expect(weekly).toContain("探索中");
    expect(weekly).toContain("成功本数だけで優先しない");
    expect(weekly).toContain("5/20 と 2/2");
    expect(weekly).toContain("観測条件");
    expect(weekly).toContain("直接比較しない");
    expect(weekly).toContain("1表示1クリック");
    expect(weekly).not.toContain("成功が多い型=効いた型");
    expect(weekly).not.toContain("効いた型を優先");
  });

  it("通常記事を本命1件・補欠1件・探索1件にし、探索の積み増しを防ぐ", () => {
    const canonicalContracts = [weekly, articleIdea, goals, runbook];
    for (const contract of canonicalContracts) {
      expect(contract).toContain("本命1件＋補欠1件＋探索1件");
      expect(contract).toContain("成功率");
      expect(contract).toContain("判定済み母数");
      expect(contract).toContain("未判定率");
      expect(contract).not.toContain("本命1件＋補欠2件");
      expect(contract).not.toContain("本命1件と補欠2件");
      expect(contract).not.toContain("効いている型を厚くする");
    }
    expect(weekly).toContain("同型の生きている記事案・観測中記事がない");
    expect(weekly).toContain("未判定率が高い型");
    expect(weekly).toContain("判定待ち");
    expect(weekly).toContain("適切な探索仮説がなければ");
    expect(weekly).toContain("全型が探索中");
  });

  it("立ち上げ期の床が観測待ちを理由にした新規0件を防ぐ", () => {
    const canonicalContracts = [weekly, articleIdea, goals, runbook];
    for (const contract of canonicalContracts) {
      expect(contract).toContain("立ち上げ期の床");
      expect(contract).toContain("6本未満");
      expect(contract).toContain("まだ試していない記事タイプ");
      expect(contract).toContain("本命1件");
    }
    expect(weekly).toContain("却下・クローズを除く");
    expect(weekly).toContain("新規0件にしない");
    expect(weekly).toContain("引き続き出さない");
  });

  it("承認画面のプロンプトタブで分析基準を参考資料として表示する", () => {
    expect(PROMPT_REGISTRY).toContainEqual(
      expect.objectContaining({
        filename: "growth-goals.md",
        group: "計測・学習",
      })
    );
  });
});
