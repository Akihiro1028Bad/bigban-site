# 60: GA4 × LaBOLA 予約画面タグ設置手順(P3a)

> 目的: 予約ファネル(記事→予約完了)を GA4 で計測できるようにする。
> 設計の正典: `docs/superpowers/specs/2026-07-16-labola-reservation-ingest-design.md` §10。
> 作業者: **人間**(LaBOLA 管理画面と GA4 管理画面の操作が必要)。所要目安 30 分+テスト予約 1 回。

## 全体像

1. LaBOLA の予約 4 画面にタグを貼る(§1)
2. GA4 管理画面でクロスドメイン設定(§2)
3. テスト予約で着弾確認(§3)
4. 未確定 2 点の実地確認結果を Claude に報告(§4)

測定 ID はサイト本体と同一の **`G-XEP1C5L70P`**(正典: `src/constants/analytics.ts`)。

---

## 1. LaBOLA 管理画面: 4 画面へのタグ貼り付け

場所: **システム設定 > 予約サービス > 予約画面** の画面別コンバージョンタグ欄。

各画面に対応するタグを**そのまま全文**コピペする。違いは最終行のイベント名だけ。

### 1-1. 情報入力画面

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XEP1C5L70P"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XEP1C5L70P');
  gtag('event', 'labola_step_input');
</script>
```

### 1-2. 内容確認画面

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XEP1C5L70P"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XEP1C5L70P');
  gtag('event', 'labola_step_confirm');
</script>
```

### 1-3. 仮予約画面

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XEP1C5L70P"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XEP1C5L70P');
  gtag('event', 'labola_reserve_pending');
</script>
```

### 1-4. 予約完了画面

```html
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XEP1C5L70P"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XEP1C5L70P');
  gtag('event', 'labola_reserve_complete');
</script>
```

⚠️ 保存時の注意:
- 保存後にタグ欄を開き直し、`<script>` が**消えたり書き換わったりしていないか**確認する(script サニタイズ有無の判明ポイント)。
- 消えていた場合は作業を中断し、§4 の報告だけ行う(フォールバック方針は §5)。

### 1-5. プログラム系(スクール/イベント)の4画面

管理画面には「プログラム情報入画面」など**プログラム系専用のタグ欄**が別にある(実地確認済み・2026-07-18)。こちらには**イベント名の末尾に `_program` を付けた同じタグ**を貼る(流路別ファネルを分けるため):

| 画面 | 最終行のイベント名 |
|------|-------------------|
| プログラム情報入力 | `labola_step_input_program` |
| プログラム内容確認 | `labola_step_confirm_program` |
| プログラム仮予約 | `labola_reserve_pending_program` |
| プログラム予約完了 | `labola_reserve_complete_program` |

それ以外の行(gtag.js 読み込み〜config)は §1-1〜1-4 と同一。

## 2. GA4 管理画面: クロスドメイン設定

GA4(プロパティ: G-XEP1C5L70P)の **管理 > データストリーム > (ウェブストリームを選択)** で:

1. **タグ設定を行う > ドメインの設定** → 「条件を追加」で `yoyaku.labola.jp` を追加して保存(クロスドメイン計測)。
   - LaBOLA の予約画面の実 URL のドメインがこれと違う場合は、実際のドメインを追加し、その値を §4 で報告。
2. **タグ設定を行う > 除外する参照元の一覧** → 同じドメインを追加(セルフリファラル防止)。
3. **管理 > イベント**(または「キーイベント」)→ `labola_reserve_complete` と `labola_reserve_complete_program` をキーイベントに登録。
   - イベントは一度着弾しないと一覧に出ないことがある。その場合は §3 のテスト後に登録。

## 3. 実地確認チェックリスト(テスト予約)

スマホまたは PC で、**本番サイトの記事ページ → 予約ボタン → LaBOLA 予約フロー**を実際に踏む。

- [ ] GA4 **リアルタイム**レポートで 4 イベント(`labola_step_input` / `labola_step_confirm` / `labola_reserve_pending` / `labola_reserve_complete`)が着弾する
- [ ] LaBOLA 画面に遷移した後もリアルタイムの「ユーザー数」が途切れず、参照元が `yoyaku.labola.jp` や `(direct)` に**なっていない**(=セッション接続 OK)
- [ ] サイト本体の計測は本番のみ有効(`VERCEL_ENV=production`)のため、**テストは本番 URL で行う**
- [ ] テスト予約は後で LaBOLA 側でキャンセルする(正準データセットにはキャンセルとして残るが件数 1 なので影響軽微)

## 4. 実地確認の記録(2026-07-18 完了)

1. **script 可否**: 可(サニタイズなし。8イベントすべて GA4 リアルタイムで着弾確認)
2. **プログラム系タグ欄**: 有り。§1-5 の `_program` サフィックスのタグを設置済み
3. **予約画面の実ドメイン**: `yoyaku.labola.jp` で確定(クロスドメイン設定と一致)
4. 補足: `labola_reserve_pending` は即時確定フローでは発生しない(0 が正常)。キーイベントは完了2種のみ登録、途中ステップは登録しない

この結果を受けて P3b(ファネル取り込み・捕捉率・D11・記事別予約完了)を実装済み。データ経路は `50-publish-metrics.md` を参照。

## 5. フォールバック(script 不可だった場合)

Measurement Protocol を**自サイトの中継エンドポイント経由**で叩くピクセルタグに切り替える(P3b で実装。api_secret はサーバー側にのみ保持し、タグには書かない)。

```html
<img src="https://thepicklebangtheory.com/api/growth/ga-pixel?e=labola_reserve_complete" width="1" height="1" alt="">
```

制約: ピクセル版は `_ga` クッキーを読めず client_id を接続できないため、**記事帰属(どの記事から来た予約か)は取れない**。取れるのは完了数と捕捉率のみ。この場合、記事帰属は「予約意図イベント(自サイト側の reservation_click)」を代理指標として使い続ける。
