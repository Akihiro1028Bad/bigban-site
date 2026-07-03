# グロースループ Windows 移植・自動実行 セットアップ手順

自宅 Windows PC でグロースループを動かし、毎週木曜の朝に自動実行するまでの手順。
コマンドは **PowerShell**(管理者不要、特記時のみ管理者)を想定。

関連: [運用ランブック](./growth-weekly-runbook.md) / [記事文体ガイド](./growth-article-style.md)

---

## 0. 必要なもの(事前に手元に用意)

Mac の `.env` から以下の値をコピーしてくる(秘密情報。USB やパスワードマネージャ等、安全な手段で):

- `GROWTH_GA4_PROPERTY_ID`(例 `540956661`)
- `GROWTH_GSC_SITE_URL`(`https://www.thepicklebang.com/`)
- `GROWTH_GOOGLE_CLIENT_ID` / `GROWTH_GOOGLE_CLIENT_SECRET` / `GROWTH_GOOGLE_REFRESH_TOKEN`
- `OPENAI_API_KEY`
- `MICROCMS_SERVICE_DOMAIN`(`thepicklebang`)/ `MICROCMS_MANAGEMENT_API_KEY`

> リフレッシュトークンは Google アカウントに紐づくため Mac の値をそのまま使えます。新規取得したい場合は手順5の補足参照。

---

## 1. ランタイムのインストール

1. **Node.js LTS(v20 以上)**: https://nodejs.org/ja からインストーラ。インストール後、PowerShell で確認:
   ```powershell
   node -v   # v20 以上
   npm -v
   ```
2. **Git**: https://git-scm.com/download/win
   ```powershell
   git --version
   ```
3. **Claude Code CLI**:
   ```powershell
   npm install -g @anthropic-ai/claude-code
   claude --version
   claude   # 初回は対話起動し、Mac と同じ Anthropic アカウントでログイン(/login)。その後 /exit
   ```
   > ログインは Mac と同一アカウントで。Notion 連携(headless で使う `mcp__claude_ai_Notion`)はアカウントに紐づくため、同じアカウントなら Windows でも使えます。

---

## 2. リポジトリの取得

```powershell
cd $HOME\dev   # 任意の作業フォルダ(無ければ mkdir $HOME\dev)
git clone https://github.com/tsu-tsu-aki/bigban.git
cd bigban
git checkout feature/growth-loop-mvp   # develop へマージ後は develop でOK
```

> Git の認証は、push しない運用なら read のみで十分。push する場合は所有者アカウント(tsu-tsu-aki)で認証。

---

## 3. 依存のインストール

```powershell
npm install
```

---

## 4. `.env` の作成

リポジトリ直下に `.env` を作成(`.env.example` を複製して値を埋める):

```powershell
Copy-Item .env.example .env
notepad .env
```

最低限、手順0の値をすべて設定。文字コードは **UTF-8** で保存。
`.env` は `.gitignore` 済みでコミットされません。

- **値のクォート**: 空白・記号(`< > | ( ) &` 等)を含む値は必ずダブルクォートで囲む(例: `RESEND_FROM="THE PICKLE BANG THEORY <onboarding@resend.dev>"`)。未クォートだと `source .env` がエラーになる。
- **疎通確認は source 非依存で**: アプリ/スクリプトは `dotenv`(各 npm スクリプトが自動読込)で `.env` を読むため、`source .env` は不要。シェルで個別の値を確認したいときは `source .env` せず、必要な変数だけ取り出す(例: `node -e "require('dotenv').config();console.log(!!process.env.RESEND_API_KEY)"`)。

---

## 5. 動作確認(本番実行の前に必ず)

```powershell
# (任意)テストが通るか
npm test

# データ取得が通るか(GA4/GSC への OAuth 接続確認)。data\snapshots に JSON が出ればOK
npm run growth:fetch

# ランチャーの組み立て確認(claude を起動せずコマンド表示)
$env:GROWTH_DRYRUN=1; npm run growth:weekly; Remove-Item Env:\GROWTH_DRYRUN

# 週次モードを1回、手動で実走(Notion に週次レポート+施策が作られる)
npm run growth:weekly
```

- `growth:weekly` が完了し、Notion の3DBに書き込まれれば移植成功。
- **補足(リフレッシュトークンを Windows で取り直す場合)**: OAuth クライアント JSON を `secrets\google-oauth-client.json` に置き、`npm run growth:setup-token` を実行 → ブラウザ同意 → 出力された値を `.env` に反映。

### ⚠ OAuth トークンの失効に注意(テスト=7日で失効)

GA4 / Search Console の取得は Google の **リフレッシュトークン**に依存します。
OAuth 同意画面のステータスが **「テスト」のままだと、付与から 7 日でトークンが失効**し、
以降の週次実行が毎回失敗します(失敗時は #224 のエラー通知が LINE に届きます)。

- **推奨: 同意画面を「本番(公開)」に昇格**する(Google Cloud Console → OAuth 同意画面 → アプリを公開)。
  公開済みアプリのリフレッシュトークンは原則無期限です(6か月未使用などで失効する場合あり)。
- **テストのまま運用する場合**は、`.env` に失効予定時刻を設定すると、失効 30 日前から
  LINE 通知の先頭に警告が出ます(テスト運用では発行日 + 7 日を入れる):
  ```env
  # 例: 2026-06-16 に発行 → 7日後に失効
  GROWTH_GOOGLE_TOKEN_EXPIRES_AT=2026-06-23T00:00:00+09:00
  ```
- **再取得手順**: `secrets\google-oauth-client.json` を置いて `npm run growth:setup-token` を実行
  → ブラウザで同意 → 出力された `GROWTH_GOOGLE_REFRESH_TOKEN` を `.env` に反映。
  併せて `GROWTH_GOOGLE_TOKEN_EXPIRES_AT` も更新する(テスト運用時)。

### つまずいたら(Windows 特有)
- `claude` が見つからない: PowerShell を開き直す/`npm i -g @anthropic-ai/claude-code` を再確認。
- ランチャーが起動しない: `run.mjs` は Windows で `claude.cmd` を shell 経由で起動し、プロンプトは標準入力で渡す実装済み。`$env:GROWTH_DRYRUN=1` で出るコマンドを、手動で `Get-Content scripts\growth\prompts\weekly.md | claude -p --permission-mode default --allowedTools ...` と叩いて切り分け。
- Notion に書けない: `claude` が Mac と同一アカウントでログイン済みか、Notion 連携が有効かを確認。
- microCMS: 下書き/画像は MCP ではなくスクリプト(管理API直叩き)で動くため、Windows で MCP 未接続でも問題なし。

---

## 6. 毎週木曜の朝に自動実行(タスクスケジューラ)

> **実行前 git pull は run.mjs に一本化済み(#219 / P1⑤)**。`npm run growth:*`(weekly / drafts / *-loop)は
> 起動時に自動で `git fetch` + `git pull --ff-only`(現在ブランチ)を行うため、**`.bat` に pull を書く必要はない**。
> pull に失敗(非 ff・conflict・ネットワーク断)した場合は「旧版のまま走り続ける」のを防ぐため工程を中断し、
> 工程名・再開コマンドを出力して LINE 通知する。動作確認(`GROWTH_DRYRUN=1`)や明示 opt-out(`GROWTH_SKIP_PULL=1`)では
> pull を skip する。成功時は週次通知に実行 SHA を載せ、承認画面(Vercel デプロイ)側 SHA とのスキュー確認ができる。
> push / commit は引き続き headless からは不可(DISALLOW 維持)。

### 6-1. 起動用バッチを作成

`scripts\growth\run-weekly.bat` を作成(PATH 差異に強いよう絶対パス推奨。`<...>` は自分の環境に置換):

```bat
@echo off
cd /d "%USERPROFILE%\dev\bigban"
call npm run growth:weekly >> "%USERPROFILE%\dev\bigban\data\weekly-cron.log" 2>&1
```

> ログが `data\weekly-cron.log` に残る(`data\` は gitignore 済み)。`npm` が見つからない場合は `call "C:\Program Files\nodejs\npm.cmd" run growth:weekly` のように絶対パスに。

### 6-2. タスク登録(GUI)

1. 「タスク スケジューラ」を開く →「タスクの作成」
2. **全般**: 名前=`growth-weekly`。「ユーザーがログオンしているかどうかにかかわらず実行する」+「最上位の特権で実行」は不要(ログオン時実行で可)。
3. **トリガー**: 新規 → 毎週 → **木曜 07:00**。
4. **操作**: プログラムの開始 → `scripts\growth\run-weekly.bat` のフルパス。
5. **条件**: 「タスクを実行するためにスリープを解除する」をオン。「コンピューターを AC 電源で使用している場合のみ」はノートPCなら状況に応じて。
6. **設定**: 「スケジュールされた時刻にタスクを開始できなかった場合、すぐにタスクを実行する」をオン。「タスクが失敗した場合の再起動の間隔」=1時間・3回。

### 6-3. 動作テスト

タスクスケジューラで `growth-weekly` を右クリック →「実行する」。`data\weekly-cron.log` に出力が出て、Notion が更新されれば自動実行の設定完了。

---

## 6.5. 構成案の修正ループ(5分間隔・Epic #40)

承認画面で記事の構成案にコメント→「修正を依頼」すると、Notion に「修正ステータス=依頼中」が立つ。
これを**5分間隔のタスク**で拾い、`claude` が構成案を修正して「提示中」にする(プル型)。
推論は `claude` サブスクを使うため **API 追加課金は無い**。

> 前提: 「記事ネタ案」DB に修正用4プロパティを追加済みであること([運用ランブック](./growth-weekly-runbook.md)の
> 「構成案の修正ループ」節の手順を参照)。未追加だと修正依頼の書き込みに失敗する。

### 6.5-1. 起動バッチ

`scripts\growth\run-revise.bat` を作成:

```bat
@echo off
cd /d "%USERPROFILE%\dev\bigban"
call npm run growth:revise-loop >> "%USERPROFILE%\dev\bigban\data\revise-cron.log" 2>&1
```

> `growth:revise-loop` が `run.mjs revise` を起動する。多重起動は `.growth-tmp\revise.lock` で防止し、
> 1日の実行上限は `GROWTH_REVISE_DAILY_CAP`(既定50)。ログは `data\revise-cron.log`(gitignore 済み)。

### 6.5-2. タスク登録

1. 「タスク スケジューラ」→「タスクの作成」。名前=`growth-revise`。
2. **トリガー**: 新規 →「1回」開始 → **詳細設定で「繰り返し間隔=5分」「継続時間=無期限」**。
3. **操作**: `scripts\growth\run-revise.bat` のフルパス。
4. **設定**: 「既に実行中の場合は新しいインスタンスを開始しない」を選ぶ(二重起動防止)。
5. **条件**: ノートPCならスリープ解除の扱いを運用に合わせて調整。

> 週次タスク(木7時)と併存して問題ない。修正ループは依頼が無ければ即終了する(空振り)。

### 6.5-3. 動作テスト

承認画面で構成案にコメント→「修正を依頼」した後、`growth-revise` を「実行する」。
`data\revise-cron.log` を確認し、Notion の当該行が「提示中」になり、LINE に修正案の通知が届けば成功。

---

## 6.6. 滞留検知(15分間隔・#220-3/#220-4)

drafts は行ごとの依頼時刻を持たないため、`生成中`/`生成待ち`のまま自宅PCが落ちても reaper が回収できず無期限に
wedge する。これを **cron 側の滞留通知**で沈黙させない。`git pull`/`失敗を沈黙させない` と同じ思想。

- **生成待ち/生成中の滞留(#220-3)**: Notion 最終更新時刻から15分超のまま止まっている記事を検知して LINE 通知(reaper で
  失敗化はしない=次回 drafts が冪等に拾い直すため)。
- **wedge 行(#220-4)**: 構成案修正が `処理中`/`依頼中` なのに依頼時刻が無く、時間で reap できない行を検知して通知。

### 6.6-1. 起動バッチ

`scripts\growth\run-stall-check.bat` を作成:

```bat
@echo off
cd /d "%USERPROFILE%\dev\bigban"
call npm run growth:stall-check >> "%USERPROFILE%\dev\bigban\data\stall-check-cron.log" 2>&1
```

### 6.6-2. タスク登録

1. 「タスク スケジューラ」→「タスクの作成」。名前=`growth-stall-check`。
2. **トリガー**: 新規 →「1回」開始 → **詳細設定で「繰り返し間隔=15分」「継続時間=無期限」**。
3. **操作**: `scripts\growth\run-stall-check.bat` のフルパス。
4. **設定**: 「既に実行中の場合は新しいインスタンスを開始しない」。

> 滞留・wedge が無ければ即終了(空振り)。動作確認は `GROWTH_DRYRUN=1 npm run growth:stall-check` で送信せず対象だけ表示。

---

## 7. 週次運用(設定後)

- **木曜 朝**: 自動で週次レポート+施策提案が Notion に届く。
- **あなた**: Notion の「施策提案」DB『今週の承認待ち』ビューと「記事ネタ案」DB で承認/却下。
- **承認後(任意のタイミング・手動)**:
  ```powershell
  npm run growth:drafts        # 承認した記事 → microCMS下書き+画像
  npm run growth:initiatives   # 承認した施策 → Notion本文に文案/仕様書
  ```
  ※下書き/施策実行は人間の承認が前提のため自動化せず手動実行(必要なら同様にスケジュール可)。

---

## メモ
- 公開(microCMS の公開ボタン)とコードのマージは引き続き人間が行う(ランチャーは git push/commit を拒否)。
- Mac と Windows の両方で動かすと二重実行になるので、本番自動実行は Windows のみに。
