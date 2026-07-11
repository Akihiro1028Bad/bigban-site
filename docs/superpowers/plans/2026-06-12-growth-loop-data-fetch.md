# 実装計画:グロースループ データ取得スクリプト

**作成日**: 2026-06-12
**ブランチ**: `feature/growth-loop-mvp`
**設計書**: [2026-06-12-growth-loop-mvp-design.md](../specs/2026-06-12-growth-loop-mvp-design.md)
**対象範囲**: 設計の「読む+溜める」部分(GA4/GSC からデータ取得 → JSON 出力・保存)

この計画は3回のレビュー(正確性 / テスト・カバレッジ / 運用・セキュリティ)を経て確定したもの。

## 1. ゴール

`npm run growth:fetch` で、先週分の GA4 / Search Console データを取得し、
JSON を標準出力 + `data/snapshots/YYYY-MM-DD.json` に保存する CLI を TDD で実装する。
分析(②)はこの JSON を入力に AI が行う(本スクリプトは分析しない)。

## 2. 技術選定

- **認証**: `google-auth-library`(OAuth リフレッシュトークン → アクセストークン更新のみ)
- **API 呼び出し**: 素の `fetch` で REST を直接叩く
  - GA4 Data API: `POST https://analyticsdata.googleapis.com/v1beta/properties/540956661:batchRunReports`
  - GSC: `POST https://searchconsole.googleapis.com/v1/sites/{siteUrl}/searchAnalytics/query`
  - 理由: 重い `googleapis` SDK を避け、依存を軽量化。素の fetch は既存 MSW でモックでき、カバレッジ100%ゲートに乗せやすい
- **一度きりのトークン取得**: `@google-cloud/local-auth`(devDep)でデスクトップ OAuth ループバックフローを実行
- **TS 実行**: `tsx`(devDep)
- **ビルド step 0**: 着手時に context7 で `google-auth-library` / GA4 Data API / GSC API の現行パターンを裏取り(プロジェクト方針)

## 3. ファイル構成(`scripts/growth/`)

| ファイル | 役割 | カバレッジ |
|---|---|---|
| `transform.ts` | API レスポンス → 自前の形に整形(純関数) | 100% 必須 |
| `ga4.ts` | GA4 へ fetch → transform 呼び出し | MSW でテスト |
| `gsc.ts` | GSC へ fetch → transform 呼び出し | MSW でテスト |
| `auth.ts` | リフレッシュトークン → アクセストークン | モックでテスト |
| `snapshot.ts` | JSON 保存(fs を注入) | 注入モックでテスト |
| `config.ts` | 環境変数の読み取り・バリデーション(Zod) | テスト |
| `period.ts` | 先週(確定済み ISO 週)の期間算出 | 100%(純関数) |
| `cli.ts` | 全体配線・標準出力 | **coverage 除外** |
| `setup-token.ts` | 一度きりのトークン取得ツール | **coverage 除外** |

設計原則: 「整形・期間計算(純関数)」と「IO(通信・ファイル・OAuth)」を分離。
純関数を100%テスト、IO は薄くして MSW / 注入で覆う。入口2ファイルのみ除外。

## 4. 取得データ項目(幅広く)

### GA4(batchRunReports で複数まとめて取得)
- サマリー: セッション数 / アクティブユーザー数 / エンゲージメント率 / キーイベント数
- チャネル別流入(`sessionDefaultChannelGroup`)
- デバイス別(`deviceCategory`)
- 人気ページ(`pagePath` × `screenPageViews`)
- ランディングページ別(`landingPage` × `sessions`)
- いずれも当週 + 前週の2期間を取得し前週比を算出

### GSC(searchAnalytics.query を複数回)
- サマリー: クリック / 表示回数 / 平均CTR / 平均掲載順位
- 上位クエリ(dimension: query)
- 上位ページ(dimension: page)
- クエリ×ページ(CTRギャップ検出用)
- デバイス別(dimension: device)
- 当週 + 前週で前週比

## 5. 出力 JSON 形

```json
{
  "generatedAt": "2026-06-18T07:00:00+09:00",
  "period":      { "start": "2026-06-08", "end": "2026-06-14" },
  "priorPeriod": { "start": "2026-06-01", "end": "2026-06-07" },
  "ga4": { "summary": {...}, "byChannel": [...], "byDevice": [...], "topPages": [...], "landingPages": [...] },
  "gsc": { "summary": {...}, "topQueries": [...], "topPages": [...], "queryPage": [...], "byDevice": [...] },
  "errors": []
}
```

## 6. TDD 順序

1. `period.ts` — 先週(確定 ISO 週)の算出。RED → GREEN
2. `transform.ts` — GA4 レスポンス整形(フィクスチャ入力)。前週比計算含む
3. `transform.ts` — GSC レスポンス整形
4. `config.ts` — 環境変数 Zod バリデーション(欠落時に明確なエラー)
5. `auth.ts` — トークン更新(fetch モック)
6. `ga4.ts` / `gsc.ts` — MSW で API レスポンスをモックし統合
7. `snapshot.ts` — fs 注入で保存検証
8. `cli.ts` 配線(除外)+ `setup-token.ts`(除外)

## 7. 重要な実装上の注意(レビューで判明)

- **GSC データ遅延 2〜3日**: 実行は木曜朝。期間は「確定済みの先週」に固定
- **GSC 日付は太平洋時間基準 / GA4 はプロパティTZ**: 週境界のズレを許容し、週次集計として扱う
- **GSC siteUrl は登録文字列と完全一致**: `https://www.thepicklebang.com/`(末尾スラッシュ込み)。URL エンコードして埋め込む
- **片方失敗でも続行**: GA4 成功・GSC 失敗でも部分結果 + `errors` に記録して出力。週次が全滅しない
- **秘密情報**: `.env` と `data/snapshots/` は .gitignore 済み。`.env.example` には空欄のみ

## 8. 追加する環境変数(`.env.example`)

```
# Growth loop (GA4/GSC データ取得・OAuth)
GROWTH_GA4_PROPERTY_ID=540956661
GROWTH_GSC_SITE_URL=https://www.thepicklebang.com/
GROWTH_GOOGLE_CLIENT_ID=
GROWTH_GOOGLE_CLIENT_SECRET=
GROWTH_GOOGLE_REFRESH_TOKEN=
```

## 9. package.json / vitest.config への変更

- `scripts`: `"growth:fetch": "tsx scripts/growth/cli.ts"`, `"growth:setup-token": "tsx scripts/growth/setup-token.ts"`
- `coverage.exclude` に `scripts/growth/cli.ts` と `scripts/growth/setup-token.ts` を追加
- スクリプトのテストファイルは先頭に `// @vitest-environment node`

## 10. 完了の定義

- `npm test` 緑・カバレッジ100%維持
- MSW モック下で期待する JSON 形が得られる
- 実データでの動作確認は Windows PC セットアップ後(オーナーが実施)
