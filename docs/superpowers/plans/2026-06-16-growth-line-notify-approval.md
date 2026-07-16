# 実装プラン: グロース週次 LINE通知 + 自前承認ページ

**履歴資料**: この文書は作成時点の判断・名称・値を保存したもので、現行仕様の正典ではありません。施設の現況・正式開業日は `scripts/growth/facility-context.json`、現行の公開境界・コマンドは `docs/operations/growth/00-canon.md` を参照してください。

作成日: 2026-06-16
対象ブランチ: `feature/growth-loop-mvp`(または派生 `feature/growth-line-notify`)
関連: [週次運用ランブック](../../operations/growth-weekly-runbook.md) / [MVP設計書](../specs/2026-06-12-growth-loop-mvp-design.md)

## 1. 目的・背景

週次グロース分析(`growth:weekly`)の結果が Notion にしか出ず、オーナーがアクセスできない・要点が掴めない。これを解決する。

- **通知**: 木曜朝、LINEグループへ要点を自動push(数字→行動文、やることTOP3)
- **閲覧**: 週次レポートDBを Notion Web公開 → 公開URLをLINEに同梱(ログイン不要で閲覧)
- **承認**: デプロイ済みサイト内に「トークン保護の承認ページ」を新設 → トグルで承認/却下 → APIがNotionのステータスを更新(ログイン不要)

## 2. 確定した設計判断

| 論点 | 決定 |
|---|---|
| 通知チャネル | LINE Messaging API(グループへ push) |
| LINE受信(Webhook) | **不要**(push送信のみ) |
| レポート閲覧 | Notion Web公開(週次レポートDBを公開設定)→ 公開URL |
| 施策の閲覧 | 承認ページ上に表示 |
| 承認/却下 | 自前承認ページ(トークン保護)→ API → Notion PATCH |
| Notion連携方式 | **fetch直叩き**(`content.ts` 流儀、`@notionhq/client` は入れない) |
| トークン方式 | 単一共有シークレット(URLクエリ)。LINEグループが信頼境界。`draft/enable` の `safeEqual` を流用 |

## 3. 新規環境変数(`.env` / `.env.example` / `config.ts`)

```
# LINE 通知
LINE_CHANNEL_ACCESS_TOKEN=        # Messaging APIチャネルのトークン
LINE_GROUP_ID=                    # 通知先グループID
# Notion 公開URL組み立て
NOTION_PUBLIC_DOMAIN=             # 例 xxxx.notion.site(レポートDB公開後に判明)
# Notion DB更新(承認ページが使用)
NOTION_TOKEN=                     # 内部インテグレーションのトークン(secret_...)
# 承認ページ保護
APPROVE_SECRET=                   # 長いランダム文字列(承認URLのtoken)
```

Notion data source ID は weekly.md 既出値を定数化:
- 週次レポート `27d6794f-4133-4cd4-9407-491d95c1b82b`
- 記事ネタ案 `5adab8b1-f182-4123-b963-9463a2580d4a`
- 施策提案 `3503f4bc-b1c4-4927-91ce-7609a6c4e460`

## 4. 実装フェーズ(TDD・各フェーズでテスト先行)

### Phase 1: Notion REST クライアント層(`scripts/growth/notion.ts` + `src/lib/notion/`)
ゼロから新規。`http.ts` の `FetchFn` 注入 + `content.ts` のエラー処理を踏襲。

- `queryDataSource({ dataSourceId, filter?, sorts?, pageSize?, token, fetchFn })` → ページ配列
- `updatePageStatus({ pageId, statusProp, statusValue, token, fetchFn })` → PATCH `/v1/pages/{id}`
- `getLatestReport({ token, fetchFn })` → 週次レポートDBを作成日降順1件 query
- ⚠️ **要確認(実装時にContext7/Notion公式で確定)**: 新API(データソース)では endpoint が `POST /v1/data_sources/{id}/query`・`Notion-Version: 2025-09-03` の可能性。collection:// は data source ID。正しい endpoint と Notion-Version をドキュメントで確定してから実装。
- テスト: `vi.fn<FetchFn>()` 注入で URL/method/headers/body を assert、エラー系(401/404)も。`// @vitest-environment node`

### Phase 2: LINE通知(weekly末尾に組込)
- `digest.ts`(**純関数**): スナップショットJSON + レポートURL + 承認URL → LINE本文文字列
  - 数字を行動文に翻訳(例「CTR1.2%」→「100回表示で1回クリック」)
  - やることTOP3抽出、`deltaPct: null`(前週データなし)分岐
  - テスト最重要(純関数なのでカバレッジ100%容易)
- `line.ts`: Messaging API push を fetch直叩き(`POST https://api.line.me/v2/bot/message/push`、`Authorization: Bearer`)。`FetchFn` 注入
- `notify-line.ts`(薄い実行入口・coverage除外): 最新スナップショット読込 → `getLatestReport` でレポートURL取得 → 公開URL/承認URL組み立て → `digest` → `line.push`
  - 最新スナップショット読込ヘルパーを新規(`snapshot.ts` は保存専用のため)。`data/snapshots/<日付>.json`
- `package.json`: `"growth:notify-line": "tsx scripts/growth/notify-line.ts"` 追加
- `run.mjs`: weekly の `allowedTools` に `Bash(npm run growth:notify-line)` 追加、プロンプト or ランチャーで weekly 完了後に実行
  - 方式A(推奨): `run.mjs` が `claude -p` 終了後に `notify-line` を spawn(claudeに依存せず確実)
  - 方式B: weekly.md に通知ステップを記載(claude経由)
  - → **方式Aを採用**(構造化・確実)
- `GROWTH_DRYRUN` 時は送信せず本文を表示

### Phase 3: 承認ページ(Next.jsアプリ)
- `src/app/api/growth/approve/route.ts`(Route Handler、`runtime = "nodejs"`)
  - GET: token検証(`draft/enable` の `safeEqual` 流用)→ 施策提案・記事ネタ案DBから承認待ち(`未処理`/`提案中`)を query して返す
  - POST: token検証 → `{ pageId, decision: "承認"|"却下" }[]` を受け、`updatePageStatus` でNotion更新。入力検証→400、token不一致→401、`NOTION_TOKEN`欠落→500
- `src/app/growth/approve/page.tsx`(または client component)
  - URLの `?token=` を保持、一覧をトグル表示(承認/却下/保留)、[まとめて保存]でPOST
  - スマホ最適・親指操作。専門用語は行動文
  - Server Componentで初期データ取得 + Client Componentで操作、が理想(CLAUDE.md準拠)
- テスト: Route Handler(node env、Notion層はモック)、コンポーネント(RTL、`getByRole`)

### Phase 4: 設定・ドキュメント・配線仕上げ
- `.env.example` に新変数追記(コメント付き)
- `config.ts`(必要分)/ Route Handlerは `process.env` 直読み(既存流儀)
- `vitest.config.ts` coverage.exclude に薄い入口(`notify-line.ts`)追加
- **セットアップ手順書**を新規: `docs/operations/growth-line-approval-setup.md`
  - Notionレポート公開手順 / Notion内部インテグレーション作成+DB共有 / LINEチャネル作成+グループ追加+ID取得 / `.env`記入

## 5. セキュリティ・注意点

- 承認URLのtokenは書込権限の鍵 → 長いランダム値、ログに出さない、LINEグループ(信頼境界)内のみ共有
- `timingSafeEqual` で定数時間比較(既存`safeEqual`流用)
- Notion公開は**閲覧専用**。レポートDBのみ公開、施策提案DBは非公開のまま(更新はAPI経由)
- `NOTION_TOKEN` はサーバ側のみ(`NEXT_PUBLIC_` を付けない)
- 入力 `pageId`/`decision` を正規表現/許可値で検証(`draft` の `CONTENT_ID_RE` 流儀)
- GA4は2026-06-10導入で前週比nullあり → 文面で「前週データなし」と明示

## 6. テスト計画(カバレッジ100%要求)

- 純関数(`digest.ts`, URL組み立て, 翻訳)→ 入出力テストを厚く
- Notion/LINEクライアント → `FetchFn`注入でリクエスト内容を assert、エラー系網羅
- Route Handler → node env、token一致/不一致/欠落、Notion層モック
- 承認ページUI → RTL、トグル操作・保存POSTの発火、アクセシビリティ(role/label)
- 薄い実行入口(`notify-line.ts`)はcoverage除外登録(既存CLI同様)

## 7. リスク / 未確定

1. **Notion APIのdata source endpoint/バージョン** — 実装前にContext7/公式で確定(最大の不確実点)
2. **レポートURL取得** — 現状stdoutのみ。Phase1の `getLatestReport`(DB query)で構造化取得。週の取り違え防止に作成日 or 週キーでフィルタ
3. **LINEグループID取得** — Botをグループ招待後、webhookイベントから取得が必要。push専用でもID取得時だけは一時的に確認手段が要る(手順書に記載)
4. **デプロイ環境** — 承認ページ/APIはデプロイ済みサイト(Vercel想定)が前提。ローカルheadless実行のnotifyとは別環境

## 8. 完了の定義

- [ ] `npm run growth:notify-line` でLINEグループに要点+2URLが届く(DRYRUN含む)
- [ ] weekly実行で分析→Notion→LINE通知まで自動で繋がる
- [ ] 公開URLをログインなしでブラウザ閲覧できる
- [ ] 承認ページでトグル→保存→Notionステータスが更新される
- [ ] 全テストgreen・カバレッジ100%維持
- [ ] セットアップ手順書が揃う
