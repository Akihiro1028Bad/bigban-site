# グロースループ設定マニュアル(初期構築)

> このファイルは**人間向けの初期構築手順**。新しい環境でグロースループを一から立ち上げ、週次モードの `GROWTH_DRYRUN=1`（空実行）が通るところまで到達するためのガイドです。日常運用は [`10-operator-guide.md`](10-operator-guide.md)、AI 実行時の詳細手順は [`../growth-weekly-runbook.md`](../growth-weekly-runbook.md) を参照してください。

前提知識ゼロでも上から順になぞれば動くように書いています。専門用語は都度補足します。

---

## 0. まず全体像を理解する

グロースループは「AI が週次でサイトの成績を分析し、Notion に記事ネタ案・施策提案・週次レポートを書き、承認したものだけを AI が下書き化する」仕組みです。**構成要素が複数の場所（Mac / 自宅 Windows PC / Vercel / 各種 SaaS）に分散**しているため、まず「どこで何が動くか」を掴んでください。

### 0-1. 構成要素と役割

| 場所 / サービス | 役割 |
|---|---|
| **Mac（開発機）** | コードの開発・修正。ここでは本番の週次自動実行は**しない**（後述、二重実行防止）。 |
| **自宅 Windows PC（本番実行機）** | 常時稼働。週次分析・下書き生成・各種修正ループ（headless agent 実行。既定は `claude -p`、任意で Codex CLI）を回す本番実行機。 |
| **Vercel（承認画面 + サイト）** | 公開サイトと承認画面 `/growth/approve` をホスト。承認画面は **Notion に「依頼」を書くだけ**（重い処理はしない）。 |
| **Notion（4つの DB）** | データの中核。①記事ネタ案 ②施策提案 ③週次グロースレポート ④学習ログ。 |
| **microCMS** | 記事本文の CMS。AI は**下書きまで**を作る（本番公開は人間が手動）。 |
| **LINE（グループ）** | 週次完了通知・週次モード自身の失敗通知の届け先。通常ループの完了/失敗は `data/growth-failures.log` と各タスクログに残す。 |
| **GA4 / Search Console（GSC）** | サイトのアクセス・検索データの取得元。 |
| **OpenAI** | アイキャッチ・本文画像の AI 生成。 |

### 0-2. データフロー（pull 型）

このシステムの背骨は **pull 型**です。承認画面（Vercel）は軽い操作（Notion への「依頼」書き込み）しかせず、重い処理（AI 推論・画像生成・microCMS 書き込み）は**常時稼働の自宅 PC 側ループが Notion をポーリングして拾う**構造になっています。

```
 ┌──────────────┐      毎週木曜 朝(自動)       ┌──────────────────────┐
 │ 自宅 Windows PC │ ─── growth:weekly ───────▶ │ GA4 / Search Console   │
 │ (常時稼働・本番) │ ◀── 成績データ取得 ────────  └──────────────────────┘
 │                │
 │ headless agentで│ ─── レポート/ネタ案/施策 ──▶ ┌──────────────────────┐
 │  分析→書き込み   │                            │ Notion 4DB            │
 │                │                            │ (ネタ案/施策/         │
 │  LINE 通知      │ ─── 「今週の数字/やること」─▶ │  週次レポート/学習ログ) │
 └──────┬───────┘        + 承認URL ─▶ LINE   └──────────┬───────────┘
        │                                                  ▲   │
        │ 5〜15分間隔でポーリング                            │   │ 「依頼」を書く
        │ (revise/regen/drafts 等のループ)                   │   │
        │  ── 承認/修正依頼を拾って処理 ─────────────────────┘   │
        │  ── 下書き作成 → microCMS ──▶ [microCMS 下書き]        │
        │  ── 画像生成 → OpenAI ──▶ [アイキャッチ/本文画像]       │
        │                                                       │
 ┌──────┴───────┐   合言葉で入る    ┌──────────────────┐        │
 │ あなた(オーナー) │ ─────────────▶ │ 承認画面 (Vercel)  │ ───────┘
 │ LINE→承認URL   │  承認/却下/修正   │ /growth/approve   │  Notion に依頼だけ書く
 └──────────────┘                  └──────────────────┘
```

**流れのまとめ**:
1. 木曜朝、自宅 PC が自動で GA4/GSC を分析 → Notion にレポート・ネタ案・施策を書く → LINE に通知。
2. あなたは LINE の承認 URL から承認画面を開き、Notion 上でネタ案・施策を承認/却下（または修正依頼）する。
3. 承認画面は Notion に「承認」「修正依頼」などのフラグを立てるだけ。
4. 自宅 PC の各種ループ（数分間隔）がそのフラグを拾い、下書き作成・画像生成・修正を実行する。
5. 最終的な**本番公開（microCMS の公開ボタン）とコードのマージは人間が手動**で行う（AI は下書きまで）。

### 0-3. 絶対に守るルール

運用に入る前に [`00-canon.md`](00-canon.md) の「絶対禁止（全モード共通）」を必ず読んでください。要点だけ:

- **本番公開しない**（AI は下書きまで）。
- **git push / commit しない**（`run.mjs` の `DISALLOW` で機械的に拒否済み）。
- **未確定情報を断定しない**（料金・所要分・未確定の日時。正典は `scripts/growth/facility-context.json`）。
- **失敗を沈黙させない**（失敗時は工程名・再開コマンドを出力し、ハード失敗を `data/growth-failures.log` に追記する。LINE は週次完了と週次失敗のみ）。

---

## 手順 1: 必要なアカウント・権限を用意する

各 SaaS のアカウントと、そこから取得する値を先にリストアップします。取得した秘密情報は USB / パスワードマネージャ等の安全な手段で扱い、**リポジトリにコミットしない**でください（`.env` は `.gitignore` 済み）。

| サービス | 取得するもの | どこで使うか |
|---|---|---|
| **Google Cloud（OAuth）** | OAuth デスクトップアプリのクライアント ID / シークレット → リフレッシュトークン | 自宅 PC（GA4/GSC データ取得） |
| **GA4** | プロパティ ID | 自宅 PC |
| **Search Console** | 登録済みプロパティの URL（完全一致） | 自宅 PC |
| **Notion** | 内部インテグレーションのトークン（`secret_...` / `ntn_...`） | 自宅 PC + Vercel |
| **microCMS** | サービスドメイン / 管理 API キー | 自宅 PC |
| **LINE Messaging API** | チャネルアクセストークン（長期）/ グループ ID | 自宅 PC |
| **OpenAI** | API キー | 自宅 PC |

- **Notion トークン**の作り方と DB 接続は「手順 4」で詳述します。
- **Google OAuth リフレッシュトークン**の取得は「手順 5」（`npm run growth:setup-token`）で行います。
- **LINE のトークン・グループ ID** の取得は「手順 6」で詳述します。

> どのアカウントも**既存のものを流用可**（例: Notion は既存ワークスペース、Google は既存アカウント）。新規に用意する必要はありません。

---

## 手順 2: 環境変数を理解する（値ではなく「どこに要るか」）

環境変数の**値の正典は [`.env.example`](../../../.env.example)** です（このガイドには値を書きません）。ここでは「どの変数が、どの環境（Mac / 自宅 PC / Vercel）に要る／不要か」と注意点だけを解説します。

### 2-1. 環境ごとの要否表

| 変数名 | 用途 | Mac | 自宅PC | Vercel |
|---|---|:---:|:---:|:---:|
| `GROWTH_GA4_PROPERTY_ID` | GA4 プロパティ ID | △ | ✅ | ✗ |
| `GROWTH_GSC_SITE_URL` | Search Console プロパティ URL | △ | ✅ | ✗ |
| `GROWTH_GOOGLE_CLIENT_ID` / `_SECRET` | OAuth クライアント情報 | △ | ✅ | ✗ |
| `GROWTH_GOOGLE_REFRESH_TOKEN` | GA4/GSC 取得用トークン | △ | ✅ | ✗ |
| `GROWTH_GOOGLE_TOKEN_EXPIRES_AT` | （任意）トークン失効予定 | △ | △ | ✗ |
| `GROWTH_LEARNING_LOG_DS` | 学習ログ DB の data source ID | ✅(設定済) | ⚠️未設定 | ⚠️未設定 |
| `GROWTH_WEEKLY_MODEL` | （任意）週次モデル上書き | △ | △ | ✗ |
| `GROWTH_GA4_KEYEVENTS_SINCE` | （任意）CV 計測開始日 | △ | △ | ✗ |
| `OPENAI_API_KEY` | 画像生成 | △ | ✅ | ✗ |
| `MICROCMS_SERVICE_DOMAIN` | microCMS サービス名 | △ | ✅ | ✅ |
| `MICROCMS_MANAGEMENT_API_KEY` | メディア/下書き書き込み | △ | ✅ | ⚠️後述 |
| `MICROCMS_CONTENT_API_KEY` | （任意）下書き content 書き込み専用 | △ | △ | △ |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE push 送信 | △ | ✅ | ✗ |
| `LINE_GROUP_ID` | 通知先グループ | △ | ✅ | ✗ |
| `GROWTH_NOTIFY_LEVEL` | LINE push 範囲（未設定=週次のみ / `all`=全通知） | △ | △ | ✗ |
| `NOTION_PUBLIC_DOMAIN` | 公開レポートの notion.site ドメイン | △ | ✅ | ✗ |
| `NOTION_TOKEN` | 承認画面/通知が DB を読み書き | △ | ✅ | ✅ |
| `NEXT_PUBLIC_SITE_URL` | 承認 URL の組み立て | ✅ | ✅ | ✅ |
| `APPROVE_AUTH_ENABLED` | 承認画面の合言葉認証 | ✗ | ✗ | ⚠️本番ON必須 |
| `APPROVE_SECRET` | 承認画面の合言葉 | ✗ | ✗ | ✅ |

凡例: ✅=必須 / △=任意・環境に応じて / ✗=不要 / ⚠️=特記あり（下記）。
※ Mac は「開発・動作確認をしたい場合に一式そろえる」位置づけ。本番の週次自動実行は自宅 PC が担うため、Mac 側は必須ではありません。

### 2-2. 特に注意する変数

- **`MICROCMS_MANAGEMENT_API_KEY` は server-only**。`NEXT_PUBLIC_` を付けて**クライアントに渡してはいけません**（強権限キーの漏洩防止・#7）。Vercel に置く場合も通常のサーバー環境変数として扱い、`NEXT_PUBLIC_` プレフィックスは絶対に付けないこと。
- **`GROWTH_LEARNING_LOG_DS`（学習ログ DB の data source ID）は現状 Mac のみ設定済み**で、**自宅 PC・Vercel には未設定**です。この状態だと**学習ログの追記が静かにスキップ**されます（本処理は止まりません＝欠落耐性）。学習ログを本番で記録したい場合は、手順 4 で作成する学習ログ DB の data source ID を自宅 PC の `.env` にも設定してください。
- **`GROWTH_NOTIFY_LEVEL` は未設定のままが推奨**です。未設定/`weekly-only` では LINE push は週次完了と週次失敗だけに絞られ、通常ループの完了・提示・失敗は送信しません。検証目的で全通知を戻したいときだけ `all`（または `normal` / `verbose`）を設定します。
- **`APPROVE_AUTH_ENABLED` は Vercel 本番で ON 必須**。未設定＝ON（フェイルセーフ）ですが、`false` にすると本番ビルドがガード（`scripts/check-prod-auth.mjs`）で失敗します。詳細は「手順 8」。
- **クォート**: 値に空白や記号（`< > | ( ) &` 等）を含む場合は必ずダブルクォートで囲むこと。未クォートだとシェルスクリプトが壊れます（例: `RESEND_FROM`）。

### 2-3. Notion DB の開発/本番分離について（未決・将来課題）

現状、Notion の DB は**開発用と本番用を分けていません**（同じ DB を共用）。この「開発/本番の分離」は**未決事項**です（issue #238 で整理中）。

- 現在、コア 3DB（記事ネタ案・施策提案・週次レポート）の **data source ID は複数ファイルにハードコード**されており、env で切り替えられるのは学習ログ DB（`GROWTH_LEARNING_LOG_DS`）のみです。
- フル分離は非推奨で、「まず data source ID を env 化する」ことが前提、という整理段階です。
- **したがって、このガイドでは現状の実態（DB は共用・ID はコード内固定）に沿って手順を書きます**。分離を試みる場合は #238 の結論を待ってください（推測でのセットアップは行わない）。

---

## 手順 3: 自宅 Windows PC のセットアップ

> ここは自宅 Windows PC の初期構築手順です。コマンドは **PowerShell**（管理者不要）を想定。

### 手順 3-1: ランタイムをインストールする

1. **Node.js LTS（v20 以上）**: https://nodejs.org/ja からインストーラを入れ、確認する。
   ```powershell
   node -v   # v20 以上であること
   npm -v
   ```
2. **Git**: https://git-scm.com/download/win を入れて確認する。
   ```powershell
   git --version
   ```
3. **Headless agent CLI**: 既定運用は Claude Code CLI。Codex 併用検証をする場合は Codex CLI も入れ、初回だけ対話ログインする。
   ```powershell
   npm install -g @anthropic-ai/claude-code
   claude --version
   claude          # 初回は対話起動。Mac と同じ Anthropic アカウントで /login → その後 /exit
   ```
   > **確認**: ログインは Mac と同一アカウントで。Notion 連携（headless で使う `mcp__claude_ai_Notion`）はアカウントに紐づくため、同じアカウントなら Windows でも使えます。

   Codex を併用する場合:
   ```powershell
   codex --version
   codex mcp login notion
   ```
   > **確認**: `GROWTH_AGENT` 未設定なら Claude のまま。Codex は `GROWTH_AGENT=codex` を付けたときだけ使います。

### 手順 3-2: リポジトリを取得する

```powershell
cd $HOME\dev                       # 無ければ mkdir $HOME\dev してから
git clone https://github.com/tsu-tsu-aki/bigban.git
cd bigban
git checkout feature/growth-loop-mvp   # develop へマージ後は develop でOK
```

> **確認**: `git status` でクリーンなクローンができていること。push しない運用なら Git 認証は read のみで十分です。

### 手順 3-3: 依存をインストールする

```powershell
npm install
```

> **確認**: エラーなく終了すること。

### 手順 3-4: `.env` を作成する

```powershell
Copy-Item .env.example .env
notepad .env
```

- 手順 1 で用意した値を、[`.env.example`](../../../.env.example) のコメントに従って埋める。**文字コードは UTF-8** で保存。
- 空白・記号を含む値は必ずダブルクォートで囲む（手順 2-2 参照）。
- `.env` は `.gitignore` 済みでコミットされません。

> **確認（source 非依存）**: アプリ/スクリプトは `dotenv` で `.env` を自動読込するため `source .env` は不要です。個別値の有無だけ確認したいときは:
> ```powershell
> node -e "require('dotenv').config();console.log(!!process.env.NOTION_TOKEN)"
> ```

---

## 手順 4: Notion の 4DB を作成・接続する

グロースループは 4 つの Notion DB を使います。役割は次の通りです。

| DB | 役割 |
|---|---|
| **記事ネタ案** | 週次が提案する記事のネタ。承認すると下書き化される。修正・画像再生成などの依頼もここに書く。 |
| **施策提案** | 週次が提案する施策。承認すると施策実行モードが Notion 本文に文案/仕様を書く。 |
| **週次グロースレポート** | 週次の数値サマリ。Web 公開してログイン不要で閲覧できるようにする。 |
| **学習ログ** | セルフチューニング用の追記専用台帳（別 DB）。1 行 = 1 イベント。 |

### 手順 4-1: 内部インテグレーションを作る

1. https://www.notion.so/my-integrations →「New integration」。
2. 種類は **Internal**。ワークスペースを選び、Capabilities は **Read content / Update content / Insert content** を有効化。
3. 発行された **Internal Integration Secret**（`secret_...` / `ntn_...`）を控える → これが `NOTION_TOKEN`。

### 手順 4-2: 各 DB を作成し、インテグレーションに接続する

上表の 4DB を作成し、それぞれ **DB ページ右上「…」→「Connections（コネクト）」→ 手順 4-1 で作ったインテグレーションを追加**します。少なくとも承認画面が更新する「施策提案」「記事ネタ案」は必須接続です。

- 各 DB の**必要プロパティは単一ソースとして [`40-notion-props.md`](40-notion-props.md) を参照**してください（このガイドには一覧を転記しません＝二重管理を避けるため）。コードは欠落耐性がありますが、プロパティは事前追加が前提です。
- **学習ログ DB** は別 data source です。作成後、その data source ID を `GROWTH_LEARNING_LOG_DS` に設定します（手順 2-2 の注意点参照。未設定なら学習ログはスキップ）。

### 手順 4-3: 週次レポート DB を Web 公開する

1. 「週次グロースレポート」DB を開く → 右上 **Share → Publish（Web に公開）**。
2. 必要なら「Search engine indexing」をオフ（検索結果に出さない）。
3. 公開 URL の**ドメイン部分**（例 `pickle.notion.site`）を控える → これが `NOTION_PUBLIC_DOMAIN`。
   - DB ごと公開するので、以降に追加される週次レポートも自動で公開されます。

> **確認**: 控えた `NOTION_TOKEN` / `NOTION_PUBLIC_DOMAIN` を自宅 PC の `.env` に記入。`NOTION_TOKEN` は後述の Vercel にも同じ値を入れます。

---

## 手順 5: Google OAuth（GA4 / GSC データ取得）を設定する

自宅 PC が GA4 と Search Console からデータを取得するには、Google の**リフレッシュトークン**が必要です。

### 手順 5-1: リフレッシュトークンを取得する

- **Mac で取得済みなら、その値をそのまま `.env` にコピーで OK**（トークンは Google アカウントに紐づくため使い回せる）。
- 新規に取り直す場合:
  1. Google Cloud Console で OAuth デスクトップアプリのクライアントを発行し、その JSON を `secrets\google-oauth-client.json` に置く。
  2. トークン取得スクリプトを実行:
     ```powershell
     npm run growth:setup-token
     ```
  3. ブラウザで同意 → 出力された `GROWTH_GOOGLE_REFRESH_TOKEN`（と関連値）を `.env` に反映する。

### 手順 5-2: ⚠ トークン失効に注意する（テスト運用 = 7 日で失効）

OAuth 同意画面のステータスが**「テスト」のままだと、付与から 7 日でトークンが失効**し、以降の週次実行が毎回失敗します（失敗は `data/growth-failures.log` と週次ログに残り、週次モード自身の失敗だけ LINE に届きます）。

- **推奨**: Google Cloud Console → OAuth 同意画面 → アプリを**「本番（公開）」に昇格**する。公開済みアプリのリフレッシュトークンは原則無期限です（6 か月未使用等で失効する場合あり）。
- **テストのまま運用する場合**: `.env` の `GROWTH_GOOGLE_TOKEN_EXPIRES_AT` に**発行日 + 7 日**を設定すると、週次 LINE 通知の先頭に警告が出ます（例は `.env.example` のコメント参照）。再取得したら本変数も更新すること。

> **確認**: この後の手順 7（スモーク）で `npm run growth:fetch` が通れば OAuth 接続 OK です。

---

## 手順 6: LINE 通知 + 承認ページを設定する

> ここは LINE 通知と承認ページの初期構築手順です。通知は自宅 PC、承認ページは Vercel で動きます。**`NOTION_TOKEN` は両環境に同じ値**を、**`APPROVE_SECRET` は Vercel 側のみ**設定します。

### 手順 6-1: LINE Messaging API を用意する

1. https://developers.line.biz/console/ で**プロバイダー**を作成（または既存を選択）。
2. 「Messaging API」チャネルを新規作成。
3. チャネル基本設定 →「Messaging API」タブ → **チャネルアクセストークン（長期）** を発行 → `LINE_CHANNEL_ACCESS_TOKEN`。
   - push のみ使うため、応答メッセージ等の受信設定は不要。
4. 通知したい LINE グループに、このチャネル（Bot）を**友だち追加 → グループに招待**。
5. **グループ ID の取得**（push 専用でも一度だけ必要）:
   - 一時的に Webhook を有効化し、Bot をグループに入れて何か発言 → Webhook イベントの `source.groupId` を確認。
   - もしくは LINE Official Account Manager / 開発ツールでグループ ID を確認。
   - 取得した `C` で始まる ID が `LINE_GROUP_ID`。

### 手順 6-2: 承認ページの合言葉を決める

承認ページ（`/growth/approve`）は URL にトークンを載せず、**画面で「合言葉」を入力して入る**方式です。この合言葉を `APPROVE_SECRET` に設定します。

- 覚えやすい語でよいが**社外秘**として扱い、LINE グループ（信頼できるメンバー）内でのみ共有する。
- ⚠️ セキュリティ: 承認 API にレート制限は無いため、短い/推測しやすい語は総当たりのリスクがあります。承認操作は「Notion のステータス変更（可逆）」のみで金銭・個人情報は扱いませんが、心配なら推測されにくい長めの語句にする（例 `openssl rand -hex 16` の出力）。
- 合言葉を変更したら、Vercel の `APPROVE_SECRET` を更新して再デプロイする。

### 手順 6-3: Vercel に環境変数を設定する

Vercel の **Production 環境変数**に次を設定し、再デプロイする:

- `NOTION_TOKEN`（手順 4-1・自宅 PC と同じ値）
- `APPROVE_SECRET`（手順 6-2）
- `APPROVE_AUTH_ENABLED`（本番では ON。詳細は手順 8。未設定＝ON なので通常は触らなくてよい）
- `MICROCMS_SERVICE_DOMAIN` / `NEXT_PUBLIC_SITE_URL` 等、承認画面や下書きプレビューが必要とする値（手順 2-1 の Vercel 列を参照）

> **確認**: 承認 URL をブラウザで開き、合言葉を入力して「入る」→ 承認待ちが一覧表示されれば承認ページ OK。500 が出る場合は Vercel の `NOTION_TOKEN` 未設定を疑う。

---

## 手順 7: 動作確認（スモーク）

環境変数が揃ったら、**本番実行の前に必ず**空実行で疎通確認します。

### 手順 7-1: データ取得（GA4/GSC の OAuth 疎通）

```powershell
npm run growth:fetch
```

> **確認**: `data\snapshots` に JSON が出れば GA4/GSC 接続 OK。失敗するなら手順 5 の OAuth を疑う。

### 手順 7-2: 週次モードの空実行（`GROWTH_DRYRUN=1`）

`GROWTH_DRYRUN=1` を付けると、**headless agent を起動せず**にランチャーが組み立てるコマンドだけを表示します（Notion にも書き込まない・LINE も送らない）。ここまで通れば初期構築の完了条件クリアです。

```powershell
$env:GROWTH_DRYRUN=1; npm run growth:weekly; Remove-Item Env:\GROWTH_DRYRUN
```

> **確認**: `[dry-run] ... claude -p --permission-mode default --allowedTools ...` と、続けて `[dry-run] then: npm run growth:notify-line ...` の 2 行が表示されれば **週次の DRYRUN 疎通 OK（初期構築の完了条件クリア）**。
> ※ 最新取り込み（`git pull --ff-only`）は weekly モードだけが対象です。weekly でも `GROWTH_DRYRUN=1` や `GROWTH_SKIP_PULL=1` のときは、動作確認を壊さないため pull をスキップします。

Codex 併用の dry-run:

```powershell
$env:GROWTH_DRYRUN=1; $env:GROWTH_AGENT="codex"; npm run growth:advise-loop; Remove-Item Env:\GROWTH_DRYRUN; Remove-Item Env:\GROWTH_AGENT
```

> **確認**: `[dry-run] ... codex -a never exec --sandbox workspace-write ...` が表示されれば Codex 起動形の組み立ては OK。実走で `tsx` IPC / Notion fetch が塞がる場合だけ `GROWTH_CODEX_SANDBOX=danger-full-access` を検証用に指定します。

### 手順 7-3: LINE 通知の本文確認（送信せず表示）

```powershell
# 先に growth:fetch でスナップショットを作ってから
$env:GROWTH_DRYRUN=1; npm run growth:notify-line; Remove-Item Env:\GROWTH_DRYRUN
```

> **確認**: 通知本文（今週の数字 / やること / 承認待ち件数 / レポート URL / 承認 URL / 失敗があれば直近7日の件数）が標準出力に出れば OK。

### 手順 7-4:（任意）本番で 1 回だけ実走する

疎通が確認できたら、実際に 1 回走らせて Notion への書き込みと LINE 通知まで一気通貫で確認できます（本番書き込みが発生するので任意）:

```powershell
npm run growth:weekly     # 分析→Notion 3DB 書き込み→自動で notify-line まで実行
```

> **確認**: Notion の週次レポート・記事ネタ案・施策提案が作られ、LINE に通知が届けば移植成功。

### つまずいたら

- `claude` が見つからない: PowerShell を開き直す / `npm i -g @anthropic-ai/claude-code` を再確認。
- `codex` が見つからない: Codex CLI のインストールと `codex --version` を確認。Notion 併用時は `codex mcp login notion` も確認。
- Notion に書けない: Claude なら Mac と同一アカウントでログイン済みか、Codex なら Notion MCP/connector がログイン済みか、DB がインテグレーションに接続済みか（手順 4）。
- LINE に届かない: 週次通知であること、`LINE_CHANNEL_ACCESS_TOKEN` / `LINE_GROUP_ID`、Bot がグループに入っているかを確認。通常ループ通知は `GROWTH_NOTIFY_LEVEL` 未設定では送られません。
- 承認待ちが空 / レポート URL が出ない: `NOTION_TOKEN` 未設定か、対象 DB がインテグレーション未接続（手順 4-2）。
- microCMS: 下書き/画像は MCP ではなくスクリプト（管理 API 直叩き）で動くため、Windows で MCP 未接続でも問題なし。

---

## 手順 8: 週次の自動実行を設定する（タスクスケジューラ）

疎通確認が済んだら、毎週木曜の朝に自動実行するよう Windows のタスクスケジューラに登録します。

> **最新取り込み（git pull）は weekly モードのときだけ run.mjs で行います**。`npm run growth:weekly` は起動時に `git fetch` + `git pull --ff-only` を行うため、**`.bat` に pull を書く必要はありません**。drafts / initiatives / 各 *-loop / デーモンは pull しません。週の途中でコードやプロンプトを更新したら、自宅PCで手動 `git pull --ff-only` するか、次の weekly を待つ／デーモンを再起動して最新化してください。weekly の pull 失敗時は「旧版のまま走り続ける」のを防ぐため工程を中断し、工程名・再開コマンドを出力して `data/growth-failures.log` に追記します。`GROWTH_DRYRUN=1` や `GROWTH_SKIP_PULL=1` では weekly でも pull を skip します。push / commit は headless からは不可（DISALLOW 維持）。

### 手順 8-0: 応答ループは「常駐デーモン」でまとめて回す（推奨・簡単）

承認画面からの依頼（構成修正・アイキャッチ/本文画像の再生成・アドバイス・装飾・コメント修正）を拾う **プル型ループ7種＋公開キュー（publish-due）＋滞留検知（stall-check）** は、個別にタスク登録しなくても、**1コマンドの常駐デーモン**でまとめて回せます。下書き生成も手動を避けたい場合は、`GROWTH_DRAFTS_AUTO=1` で opt-in できます。

```powershell
npm run growth:daemon
```

- 起動しておくだけで、各ループを**間隔ごとに自動巡回**（pull系=既定1分・publish-due=5分・stall-check=15分）。依頼が無いループは軽い `peek` だけで空振りし、headless agent 起動も日次上限カウントも発生しないので、依頼は**押してから最大1〜2分**で拾われます。
- `GROWTH_DRAFTS_AUTO=1` を付けると、`drafts-auto` もデーモンに追加されます。既定5分間隔で「承認済み/生成中 かつ 下書きID未作成」の記事だけを軽く `peek` し、対象がある時だけ `growth:drafts` 相当の下書き生成を起動します。対象が無い時は headless agent を起動しません。
- `GROWTH_INITIATIVES_AUTO=1` を付けると、`initiatives-auto` もデーモンに追加されます。既定5分間隔で「承認済み」の施策だけを軽く `peek` し、対象がある時だけ `growth:initiatives` 相当の施策成果物化を起動します。対象が無い時は headless agent を起動しません。
- デーモンは git pull しません。デプロイ後や週途中のコード更新を反映したい場合は、自宅PCで手動 `git pull --ff-only` するか、デーモンを再起動して最新化してください。
- デーモンやタスクスケジューラで回すコマンドは、soft fail も後で追えるよう `>> data\*.log 2>&1` でログファイルへリダイレクトしてください。ハード失敗は別途 `data\growth-failures.log` に構造化追記されます。
- 7つのプル型ループは元々**1つのロックを共有**（同時に2つは動かない）ので、デーモンが逐次実行するのと整合します。**このデーモンを使えば下の 8-4（個別タスク登録）は不要**です。
- 間隔は環境変数で調整可: `GROWTH_DAEMON_PULL_EVERY_MS` / `GROWTH_DAEMON_DRAFTS_EVERY_MS` / `GROWTH_DAEMON_INITIATIVES_EVERY_MS` / `GROWTH_DAEMON_PUBLISH_EVERY_MS` / `GROWTH_DAEMON_STALL_EVERY_MS`。`Ctrl+C` で安全停止（実行中ジョブの完了後に終了）。
- **常駐させる**: Mac を常時つけっぱなしなら launchd/ログイン項目に、Windows ならタスクスケジューラで「ログオン時に起動」に登録すれば起動時に自動で常駐します。これで**Windowsで7個のタスクを個別登録する手間が消えます**。
- 対象外（デーモンに既定では含めない）: `weekly`（週次・8-2 で別途スケジュール）、`drafts`/`initiatives`（承認後の重い処理＝既定は手動。`GROWTH_DRAFTS_AUTO=1` / `GROWTH_INITIATIVES_AUTO=1` で opt-in 可）。

> つまり最小構成は **①週次だけタスク登録（8-2）＋②`growth:daemon` を常駐** の2つだけ。以下の 8-1〜8-4 は「デーモンを使わず個別登録したい場合」の手順です。

### 手順 8-1: 起動用バッチを作る

`scripts\growth\run-weekly.bat` を作成（絶対パス推奨。`%USERPROFILE%\dev\bigban` は自分のクローン先に合わせる）:

```bat
@echo off
cd /d "%USERPROFILE%\dev\bigban"
call npm run growth:weekly >> "%USERPROFILE%\dev\bigban\data\weekly-cron.log" 2>&1
```

> ログは `data\weekly-cron.log`（`data\` は gitignore 済み）。`npm` が見つからない場合は `call "C:\Program Files\nodejs\npm.cmd" run growth:weekly` のように絶対パスに。

### 手順 8-2: タスクを登録する（GUI）

1. 「タスク スケジューラ」→「タスクの作成」。名前 = `growth-weekly`。
2. **トリガー**: 新規 → 毎週 → **木曜 07:00**。
3. **操作**: プログラムの開始 → `scripts\growth\run-weekly.bat` のフルパス。
4. **条件**: 「タスクを実行するためにスリープを解除する」をオン。
5. **設定**: 「スケジュールされた時刻にタスクを開始できなかった場合、すぐにタスクを実行する」をオン。「タスクが失敗した場合の再起動」= 1 時間・3 回。

### 手順 8-3: 動作テスト

タスクスケジューラで `growth-weekly` を右クリック →「実行する」。`data\weekly-cron.log` に出力が出て Notion が更新されれば自動実行の設定完了。

### 手順 8-4: 各種ループのタスク（承認後の処理を自動で拾う）

> **手順 8-0 の `growth:daemon` を常駐させる場合、この 8-4 は不要**です（デーモンが同じループをまとめて回します）。デーモンを使わず個別に登録したい場合のみ以下を行います。

pull 型の各ループも、承認/依頼を拾えるようタスク登録します（いずれも依頼が無ければ即終了する空振り設計）。バッチはいずれも上記と同型（`cd /d ... & call npm run <script> >> ...log`）。

| タスク名 | 呼ぶスクリプト | 推奨間隔 | 目的 |
|---|---|---|---|
| `growth-revise` | `npm run growth:revise-loop` | 5 分 | 構成案/タイトルの修正依頼を拾う（#40）。多重起動は lockfile で防止、1 日上限 `GROWTH_REVISE_DAILY_CAP`（既定 50）は実際に依頼を処理した回数だけ数える。 |
| `growth-stall-check` | `npm run growth:stall-check` | 15 分 | 生成待ち/生成中のまま止まった記事・wedge 行を検知してログに残す（`GROWTH_NOTIFY_LEVEL=all` の検証時だけ LINE 送信）。 |

- 繰り返しタスクは**トリガーを「1 回」→ 詳細設定で「繰り返し間隔=5 分（または 15 分）」「継続時間=無期限」**に設定。
- **設定タブで「既に実行中の場合は新しいインスタンスを開始しない」**を選ぶ（二重起動防止）。
- 他のループ（regen / regen-body / advise / decorate 等）も必要に応じて同様に登録できます。全モードの一覧は [`00-canon.md`](00-canon.md) の「実行モード一覧」、詳細は [`30-loops.md`](30-loops.md) を参照。

### 手順 8-5: 承認後の実行（手動 / opt-in 自動）

下書き生成・施策実行は**人間の承認が前提**なので、既定では手動実行です:

```powershell
npm run growth:drafts        # 承認した記事 → microCMS 下書き + 画像
npm run growth:initiatives   # 承認した施策 → Notion 本文に文案/仕様書
```

手動実行を避けたい場合は、デーモン起動時に下書き自動生成や施策自動成果物化を opt-in します:

```powershell
$env:GROWTH_DRAFTS_AUTO="1"; $env:GROWTH_INITIATIVES_AUTO="1"; npm run growth:daemon
```

Codex で動かす場合:

```powershell
$env:GROWTH_AGENT="codex"; $env:GROWTH_CODEX_SANDBOX="danger-full-access"; $env:GROWTH_DRAFTS_AUTO="1"; $env:GROWTH_INITIATIVES_AUTO="1"; npm run growth:daemon
```

この場合も `weekly` は自動巡回に含めません。`drafts-auto` は `growth:drafts-auto-peek`、`initiatives-auto` は `growth:initiatives-auto-peek` で対象件数を確認し、0件なら何も起動しません。

> **二重実行に注意**: Mac と Windows の両方で本番自動実行すると二重実行になります。**本番の自動実行は自宅 Windows PC のみ**にしてください。

---

## 手順 9: 本番公開前チェックリスト

Vercel の承認画面を本番公開する前に、必ず次を確認してください（横断ハードニングは #7）。

- [ ] **`APPROVE_AUTH_ENABLED` を必ず ON**（未設定＝ON でも可・`false` にしない）。承認画面は強権限 API を叩くため、合言葉ゲートが必須です。`false` のままだと本番ビルドがガード（`scripts/check-prod-auth.mjs`）で失敗します。
- [ ] **`APPROVE_SECRET`（合言葉）を Vercel に設定**し、推測されにくい語にしてある。
- [ ] **`MICROCMS_MANAGEMENT_API_KEY` に `NEXT_PUBLIC_` を付けていない**（server-only・クライアントへ渡さない）。
- [ ] **`NOTION_TOKEN` が Vercel（承認画面用）と自宅 PC（通知用）で同じ値**になっている。
- [ ] Google OAuth 同意画面を**「本番（公開）」に昇格済み**（テストのままだと 7 日で失効）。
- [ ] 週次レポート DB を **Web 公開済み**で、ログインなしで開ける。
- [ ] [`00-canon.md`](00-canon.md) の「絶対禁止」を運用者全員が理解している。

---

## 関連ドキュメント

- 正典・絶対禁止・実行モード一覧: [`00-canon.md`](00-canon.md)
- Notion 必要プロパティ一覧（単一ソース）: [`40-notion-props.md`](40-notion-props.md)
- 環境変数の値（単一ソース）: [`.env.example`](../../../.env.example)
- 各ループの詳細: [`30-loops.md`](30-loops.md)
- 公開キュー・計測ループ: [`50-publish-metrics.md`](50-publish-metrics.md)
- KPI ツリー・オーナー手入力: [`60-kpi-tree.md`](60-kpi-tree.md)
- AI 実行時の運用手順: [`../growth-weekly-runbook.md`](../growth-weekly-runbook.md)
- 文体・構成・NG: [`../growth-article-style.md`](../growth-article-style.md)
