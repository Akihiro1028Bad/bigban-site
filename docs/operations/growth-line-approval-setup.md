# グロース週次 LINE通知 + 承認ページ セットアップ手順

週次グロース分析の結果を LINE グループへ通知し、承認ページ(合言葉を入力して入る)で施策を承認/却下するための初期設定。
コードは実装済み([プラン](../superpowers/plans/2026-06-16-growth-line-notify-approval.md))。ここでは外部サービスの設定と環境変数の記入だけを行う。

## 全体像

| 役割 | 動く場所 | 必要な環境変数 |
|------|---------|----------------|
| 週次LINE通知(`growth:notify-line`) | 自宅PC(headless) | LINE_*, NOTION_TOKEN, NOTION_PUBLIC_DOMAIN, NEXT_PUBLIC_SITE_URL |
| 承認ページ(`/growth/approve` + API) | デプロイ済みサイト(Vercel) | NOTION_TOKEN, APPROVE_SECRET |
| レポート閲覧 | Notion 公開ページ | (公開設定のみ) |

> ポイント: 通知は自宅PC、承認ページはVercel で動く。**NOTION_TOKEN は両方の環境に同じ値**を設定する。**APPROVE_SECRET(合言葉)は承認ページが動く Vercel 側のみ必須**(URL にトークンを載せず画面で入力するため、PC の通知側では不要)。

---

## 1. Notion 内部インテグレーション(承認ページがDBを更新するため)

1. https://www.notion.so/my-integrations →「New integration」
2. 種類は **Internal**。ワークスペースを選び、Capabilities は **Read content / Update content / Insert content** を有効化
3. 発行された **Internal Integration Secret**(`secret_...` または `ntn_...`)を控える → これが `NOTION_TOKEN`
4. 対象2つのDBをこのインテグレーションに接続(各DBページ右上「…」→「Connections(コネクト)」→ 作成したインテグレーションを追加):
   - 「施策提案」DB
   - 「記事ネタ案」DB

## 2. レポートDBを Web 公開(ログイン不要の閲覧)

1. 「週次グロースレポート」DB を開く → 右上 **Share → Publish(Webに公開)**
2. 必要なら「Search engine indexing」をオフ(検索結果に出さない)
3. 表示された公開URLの **ドメイン部分**(例 `pickle.notion.site`)を控える → これが `NOTION_PUBLIC_DOMAIN`
   - DBごと公開するので、以降に追加される週次レポートも自動で公開される

## 3. LINE Messaging API(グループ通知)

1. https://developers.line.biz/console/ で **プロバイダー** を作成(または既存を選択)
2. 「Messaging API」チャネルを新規作成
3. チャネル基本設定 →「Messaging API」タブ:
   - **チャネルアクセストークン(長期)** を発行 → `LINE_CHANNEL_ACCESS_TOKEN`
   - 応答メッセージ等は任意(push のみ使うため受信応答は不要)
4. 通知したいLINEグループに、このチャネル(Bot)を **友だち追加 → グループに招待**
5. **グループID の取得**(push 専用でも一度だけ必要):
   - 一時的に Webhook を有効化し、Bot をグループに入れて何か発言 → Webhook イベントの `source.groupId` を確認
   - もしくは LINE Official Account Manager / 開発ツールでグループIDを確認
   - 取得した `C` で始まるIDが `LINE_GROUP_ID`

## 4. 承認ページの合言葉を決める

承認ページは URL にトークンを載せず、**画面で「合言葉」を入力して入る**方式。
この合言葉を `APPROVE_SECRET` に設定する。**合言葉を知る人だけが承認/却下できる**ため、LINEグループ(信頼できるメンバー)内のみで共有する。

- 例として合言葉は `ビックマン`。覚えやすい語でよいが、**社外秘**として扱う。
- ⚠️ セキュリティ注意: 承認APIにはレート制限が無いため、短い/推測しやすい語は総当たり(ブルートフォース)のリスクがある。承認操作は「Notion のステータス変更(可逆)」のみで金銭・個人情報は扱わないが、心配なら推測されにくい長めの語句にする(例 `openssl rand -hex 16`)。
- 合言葉を変更したら、自宅PC の `.env` と Vercel の両方を更新し、再デプロイする。

## 5. 環境変数の記入

### 自宅PC の `.env`(`.env.example` の該当セクション)
```
LINE_CHANNEL_ACCESS_TOKEN=（手順3）
LINE_GROUP_ID=（手順3）
NOTION_PUBLIC_DOMAIN=（手順2 例 pickle.notion.site）
NOTION_TOKEN=（手順1）
# 既存。承認ページURLの組み立てに使用
NEXT_PUBLIC_SITE_URL=https://www.thepicklebang.com
# APPROVE_SECRET（合言葉）は PC の通知側では不要(Vercel 側のみ必須)
```

### Vercel(Production 環境変数)
```
NOTION_TOKEN=（手順1・PCと同じ値）
APPROVE_SECRET=（手順4・PCと同じ値）
```
設定後に再デプロイする。

---

## 6. 動作確認

```bash
# 通知本文の確認(送信せず標準出力に表示)。先に growth:fetch でスナップショットを作る
npm run growth:fetch
GROWTH_DRYRUN=1 npm run growth:notify-line

# 実送信(LINEグループに届く)
npm run growth:notify-line
```
- LINE に「今週の数字 / やること / 承認待ち件数 / レポートURL / 承認URL」が届けば通知OK。
- 承認URL(`/growth/approve`)をブラウザで開く → **合言葉を入力して「入る」** → 承認待ちが一覧表示され、承認/却下→保存でNotionのステータスが変われば承認ページOK。
- レポートURL(notion.site)がログインなしで開ければ公開OK。

## 7. 週次の自動運用

`npm run growth:weekly` を実行すると、分析→Notion登録の **完了後に自動で `growth:notify-line` が走る**(`run.mjs` が連結)。
木曜朝の自動実行は [growth-windows-setup.md](./growth-windows-setup.md) のタスクスケジューラ設定に準じる(weekly を1本登録すれば通知まで一気通貫)。

## つまずいたら

- **LINEに届かない**: `LINE_CHANNEL_ACCESS_TOKEN` / `LINE_GROUP_ID` を確認。Bot がグループに入っているか。
- **承認待ちが空 / レポートURLが出ない**: `NOTION_TOKEN` 未設定か、対象DBがインテグレーションに未接続(手順1-4)。
- **承認ページで「合言葉が違います」**: 入力した合言葉と Vercel の `APPROVE_SECRET` が一致しているか。
- **承認ページが 500**: Vercel に `NOTION_TOKEN` が未設定。
- **レポートが開けない(ログイン要求)**: 手順2の Web 公開が未実施。
