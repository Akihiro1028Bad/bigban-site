# グロース承認画面（分析・レビュー・公開ツール）改善レビュー

- 作成日: 2026-06-25
- 対象: `src/app/growth/approve/**`（中心 `ApproveClient.tsx` 2537行）＋ `src/app/api/growth/**` ＋ `src/lib/growth/**` ＋ pull型ループ `scripts/growth/**`
- 方法: 7職種の精鋭チームを並列で起動し、各レンズで read-only レビュー → メインが重複統合・深刻度/ICE正規化・優先度付け（実装はしていない）
- チーム（出典レンズ）: **UX**(プロダクトデザイナー) / **FE**(シニアフロントエンド) / **BIZ**(経営者) / **WRITE**(ライター/編集者) / **SPEC**(PdM/仕様) / **QA**(QA/信頼性) / **SEC**(セキュリティ)
- 件数: 統合後 **48項目**（CRITICAL 5 / HIGH 22 / MEDIUM 16 / LOW 5）
- ICEの読み方: I=Impact, C=Confidence, E=Ease を各1–5で正規化（各レンズが提出した素のスコアをメインが横断比較できるよう再採点）。`ICE合計`=I+C+E（最大15）。

> 注: 深刻度はメインによる統合判断。`本番公開前に必ず対応`は最優先群（C1〜C5）。出典レンズは「どの専門家が指摘したか」を併記（複数=横断的に確認された強い指摘）。

---

## 1. エグゼクティブサマリ（最重要 Top 10）

1. **C1 認証フェイルオープン**: `APPROVE_AUTH_ENABLED=false` がソース直書き。この状態で本番デプロイすると、URLを知る誰でも承認・公開・microCMSメディアアップロード（MANAGEMENT API）まで無認証で叩ける。**本番公開の絶対前提**（SEC/FE 一致）。
2. **C2 pull型ループの永久詰まり＋死活監視不在**: 「依頼中」のまま固まったAI依頼を回収する reaper は「処理中」しか拾わず、しかもその reaper 自体が落ちたPC上でしか動かない。最頻障害「PC全停止」を誰も検知できず「沈黙させない」要件が中核で破綻（SPEC/QA 一致）。
3. **C3 本文ミラーの片落ち**: Notion（プレビュー正本）→microCMS（公開ターゲット）の2フェーズ書込が部分失敗すると恒久ズレし、`publish` が**画面で見せた本文と違う旧本文を本番公開**する（SPEC）。
4. **C4 記事別の効果測定が無く"ループ"が閉じていない**: 公開記事↔GA4↔Notionネタ案がID連結されておらず「どの記事が客を連れてきたか」が不明。量産しても学習が回らない事業上の最大欠落（BIZ）。
5. **C5 §6/§14 のNG表現・AI定型を確定的に検出する仕組みが無い**: AI記事の品質を最も落とす「誇大語・翻訳調・括弧書き直訳・同語多発」を、0秒・無料・100%再現で潰せる linter にせず、唯一AI往復(advise)に依存（WRITE）。
6. **H 公開ボタンがプレビューより上＋`window.confirm`＋冪等性なし**: 最終確認の本番プレビューより前に「公開する」が置かれ、確認はネイティブ`confirm`（モバイル不安定）、二重押下で公開済みへ再patch（手直しタイトルを上書き）(UX/FE/QA/SPEC)。
7. **H 公開前チェックが甘く強制力が無い**: 文字数下限800字は style-guide §2 の1,500字を大きく割り「800字で緑」。全項目が黄止まりで重大違反でも公開可能（WRITE）。
8. **H ポーリング失敗の完全沈黙**: 盤・下書きの再取得失敗を握り潰し、回線断/401失効/PC停止でも「古いデータを最新のように」見せ続ける（UX/QA/FE 一致）。
9. **H 認証ロジックの19〜20ファイル複製**: `safeEqual`/`verifyToken` が各APIに独立実装。1箇所の修正漏れが認証バイパスに直結（SEC/FE 一致）。
10. **H ApproveClient.tsx 2537行・useState 48個の単一巨大コンポーネント**: 状態が相互干渉し、本レビューの多くのバグ温床（render再生成・楽観更新・ポーリング）の根本原因（FE）。

---

## 2. 優先度マスター一覧

| ID | タイトル | レンズ | 深刻度 | ICE合計 | 該当 |
|----|---------|--------|--------|---------|------|
| C1 | 認証フェイルオープン（AUTH_ENABLED=false直書き） | SEC,FE | CRITICAL | 14 | `src/config/featureFlags.ts:15` |
| C2 | pull型「依頼中」永久詰まり＋死活監視がPC内のみ | SPEC,QA | CRITICAL | 13 | `scripts/growth/advise.ts:234`,`revise.ts:284` ほか全ループ |
| C3 | Notion↔microCMS ミラー片落ちで公開本文が乖離 | SPEC | CRITICAL | 13 | `src/app/api/growth/draft/edit/route.ts:124` |
| C4 | 記事別効果測定が無くループが閉じていない | BIZ | CRITICAL(事業) | 12 | `scripts/growth/digest.ts`／承認画面に指標なし |
| C5 | §6/§14 NG語・AI定型の確定的linterが無い | WRITE | CRITICAL(品質) | 12 | `src/app/growth/approve/draftQuality.ts` |
| H1 | 公開ボタンがプレビューより上（誤公開導線） | UX | HIGH | 11 | `ApproveClient.tsx:1990` |
| H2 | 公開/クローズが`window.confirm`・成功通知なし・冪等性なし | UX,FE,QA,SPEC | HIGH | 12 | `ApproveClient.tsx:759,781`／`publish/route.ts:80` |
| H3 | 公開前チェック文字数下限800字（§2は1,500字） | WRITE | HIGH | 14 | `draftQuality.ts:23` |
| H4 | 公開前チェックが黄止まり・公開ブロック不在 | WRITE | HIGH | 13 | `draftQuality.ts:13`／`DraftChecklist.tsx` |
| H5 | ポーリング失敗の完全沈黙（古いデータを最新に偽装） | UX,QA,FE | HIGH | 12 | `ApproveClient.tsx:416,553` |
| H6 | `safeEqual`/`verifyToken` の19〜20ファイル複製 | SEC,FE | HIGH | 14 | 全 `api/growth/*/route.ts` |
| H7 | ApproveClient.tsx 2537行・useState48の単一巨大化 | FE | HIGH | 13 | `ApproveClient.tsx:261-2537` |
| H8 | モーダルにフォーカストラップ無し（3画面で挙動バラバラ） | UX,FE | HIGH | 11 | `ApproveClient.tsx:2286,2329` |
| H9 | 段階ガード不在（生成中・公開済みへ依頼/編集が通る） | SPEC | HIGH | 13 | `revise/route.ts:106`,`draft/edit/route.ts` |
| H10 | 楽観更新`decided`がリコンサイルされずゴースト残留 | SPEC | HIGH | 13 | `ApproveClient.tsx:293,436` |
| H11 | pull型の「待ち」体験が受動的・提示完了に気づけない | UX,QA,SPEC | HIGH | 12 | `ApproveClient.tsx:441,1799` |
| H12 | 滞留検知が生成パイプラインのみ・5ループに無い | QA,SPEC | HIGH | 12 | `generating.ts:14`／各ループ表示 |
| H13 | 盤ポーリングがAI副ステータスを見ず提示完了を取りこぼす | QA,SPEC,UX | HIGH | 11 | `ApproveClient.tsx:441` |
| H14 | APIレスポンスを`as`でキャスト・ランタイム検証なし | FE | HIGH | 12 | `ApproveClient.tsx:219,534,561` |
| H15 | ローカル`PendingItem`型がlib公開型と乖離（緩い） | FE | HIGH | 12 | `ApproveClient.tsx:119` vs `lib/growth/approve.ts:23` |
| H16 | 微小フォント＋低コントラストでWCAG AA未達 | UX | HIGH | 11 | `AdviceCard.tsx`(text-[10px]多数),`InlineCommentReview.tsx:169` |
| H17 | 単一キーショートカット誤爆（contenteditableで承認/却下） | UX | HIGH | 11 | `shortcuts.ts:29`／`ApproveClient.tsx:462` |
| H18 | §5「AI下書き免責文」末尾の有無を未チェック | WRITE | HIGH | 14 | `draftQuality.ts:63` |
| H19 | 内部リンクは本数だけ・実在/壊れリンクを検証せず | WRITE | HIGH | 12 | `draftQuality.ts:48` |
| H20 | メタディスクリプション(excerpt)の編集UIが無い | WRITE | HIGH | 12 | `scripts/growth/draft-meta.ts:49`／承認画面 |
| H21 | §13 時期ズレ・doNotWrite断定の機械検出が無い | WRITE | HIGH | 13 | `facility-context.json`／承認画面 |
| H22 | 用語統一（表記ゆれ）検出が無い | WRITE | HIGH | 12 | 支援機能全般 |
| H23 | 属人化（承認〜公開が単一人物の全件手動） | BIZ | HIGH | 13 | 承認フロー全体 |
| H24 | 予約公開・配信平準化が無い（即時PUBLISHのみ） | BIZ | HIGH | 13 | `publish/route.ts` |
| H25 | ファイルアップロードがmagic byte未検証（SVG/HTML混入） | SEC | HIGH | 13 | `media/route.ts:101`,`lib/growth/media.ts:47` |
| H26 | トークンがクエリ文字列露出（ログ/Referer漏洩） | SEC | HIGH | 13 | `ApproveClient.tsx:205` ほか |
| H27 | safeEqual 長さ事前リターンでタイミングリーク | SEC | HIGH | 12 | 全ルート `safeEqual` |
| H28 | 依存CVE: dompurify 3.4.1 / next 16.2.1 | SEC | HIGH | 13 | `package.json` |
| H29 | bodyComment reaper だけ status条件欠落（誤失敗通知） | QA | HIGH | 14 | `scripts/growth/bodyComment.ts:377` |
| M1 | bulkDecide が fire-and-forget・savingId単一で表示破綻 | FE,QA | MEDIUM | 12 | `ApproveClient.tsx:1230` |
| M2 | render*関数11個が毎描画再生成・key=idx | FE | MEDIUM | 11 | `ApproveClient.tsx:1285,1542` |
| M3 | 即時保存の承認/却下に確認なし・誤タップ即反映 | UX | MEDIUM | 11 | `ApproveClient.tsx:736,1445` |
| M4 | 元 vs 新が縦並び・差分ハイライト無し | UX,WRITE | MEDIUM | 11 | `ApproveClient.tsx:1842`／`AdviceCard.tsx:303` |
| M5 | インラインコメントbefore/afterがタグ除去で装飾変化が不可視 | WRITE | MEDIUM | 11 | `InlineCommentReview.tsx:196` |
| M6 | 詳細パネルに全機能を縦積み・認知過多/フェーズ不明 | UX,WRITE | MEDIUM | 10 | `ApproveClient.tsx:1964,2300` |
| M7 | 承認GET/POSTの逐次await・N+1 Notion呼び出し | FE | MEDIUM | 12 | `approve/route.ts:86,128` |
| M8 | copyText がclipboard失敗を握り潰し成否トーストなし | UX,FE | MEDIUM | 13 | `ApproveClient.tsx:1901` |
| M9 | トーストが自動消滅せず aria-live固定でない | UX | MEDIUM | 10 | `ApproveClient.tsx:278,2470` |
| M10 | 段階インジケータのドットがa11y弱・非テキストコントラスト不足 | UX | MEDIUM | 11 | `ApproveClient.tsx:1313` |
| M11 | 公開のSEOメタ/OGP/構造化データ未設定（ステータス反転のみ） | BIZ | MEDIUM | 11 | `publish/route.ts` |
| M12 | 装飾/アドバイス3機能＋3ループがROIに対し過剰 | BIZ | MEDIUM | 10 | advise/decorate/advise-apply |
| M13 | 未知ステータスを proposed に倒し進行中記事を巻き戻す | SPEC | MEDIUM | 9 | `stage.ts:44` |
| M14 | 却下の取り消し導線が盤に無い（リロードで不可） | SPEC | MEDIUM | 11 | `approve/route.ts:61`,`board.ts:22` |
| M15 | リライト（既存記事改善）動線が無い | BIZ | MEDIUM | 10 | ネタ種別／成績起点フロー |
| M16 | エラー分類が脆い（正規表現照合）・非JSONを丸める | QA | MEDIUM | 11 | `apiError.ts:23`,`safeJson.ts:17` |
| L1 | カンバン列が独立縦スクロールせずsticky効果が薄い | UX | LOW | 8 | `ArticlesView.tsx:51` |
| L2 | 初期タブ未確定で施策→記事のちらつき | UX | LOW | 9 | `ApproveClient.tsx:1195,380` |
| L3 | 空状態がタブ別/検索別に用意されていない | UX | LOW | 8 | `ApproveClient.tsx:1168` ほか |
| L4 | featureFlags値がクライアントバンドルに含まれる | SEC | LOW | 9 | `featureFlags.ts:15` |
| L5 | エラーレスポンスにNotionプロパティ名が漏れる | SEC | LOW | 9 | `apiError.ts:55` |

---

## 3. カテゴリ別 詳細

### 3.1 横断・セキュリティ（本番公開ゲート）

#### C1 認証フェイルオープン（最優先） — SEC,FE
- 現状: `src/config/featureFlags.ts:15` で `export const APPROVE_AUTH_ENABLED = false;` を直書き。各APIルートは `if (!APPROVE_AUTH_ENABLED) return true;`（例 `api/growth/approve/route.ts:43`）でトークン検証を完全スキップ。
- 問題: この状態で本番デプロイすると、URLを知る誰でも `/api/growth/approve`(承認/却下)・`/api/growth/draft/edit`(下書き本文上書き)・`/api/growth/media`(MANAGEMENT APIでメディアアップロード) 等19エンドポイントを無認証で実行可能。CLAUDE.md にも「本番公開前に必ずONにする」とあるが、**コードで担保する仕組みが無い**（人間の記憶頼み＝フェイルオープン）。
- 改善案: `APPROVE_AUTH_ENABLED = process.env.APPROVE_AUTH_ENABLED === "true"` に変更し、**未設定時は `true`（フェイルセーフ）** にする。`false` をソースに残さない。CIで「本番ビルド時に false なら fail」のガードを追加。
- 深刻度: CRITICAL / ICE: I=5 C=5 E=4（合計14）

#### H6 認証ロジックの19〜20ファイル複製 — SEC,FE
- 現状: `safeEqual` が約20箇所、`verifyToken` が約19箇所に独立コピー実装（`approve/route.ts:25-53` ほか）。実装に微妙なばらつきあり。
- 問題: 認証アルゴリズム変更（H27のタイミングリーク修正など）時に全ファイルを正確に直さないと、一部ルートが脆弱なまま残り認証バイパスに直結。
- 改善案: `src/lib/growth/apiAuth.ts` に `verifyToken(url): boolean` / `unauthorized()` / `safeEqual()` を集約し全ルートから import。
- 深刻度: HIGH / ICE: I=5 C=5 E=4（14）

#### H25 ファイルアップロードの magic byte 未検証 — SEC
- 現状: `media/route.ts:101` の `validateUpload({ type: file.type })` は **クライアント申告の Content-Type** を信頼（`lib/growth/media.ts:47`）。
- 問題: `Content-Type: image/jpeg` を偽装した SVG/HTML を `/api/growth/media` に送ると検証を通過し MANAGEMENT API でアップロードされる。SVG内 `<script>` 経由のXSS／アイキャッチとして読者に表示されるリスク。C1解消後も承認権限者がこの経路を使える。
- 改善案: `file.arrayBuffer()` 先頭バイトをマジックバイト照合（JPEG=`FF D8 FF`、PNG=`89 50 4E 47`、WebP 等）。SVG/HTMLは拒否。
- 深刻度: HIGH / ICE: I=4 C=5 E=4（13）

#### H26 トークンのクエリ文字列露出 — SEC
- 現状: 全fetchが `/api/growth/...?token=XXX`（`ApproveClient.tsx:205` ほか多数）。`Referrer-Policy: no-referrer` は `/growth/approve` ページのみで `/api/growth/**` に無い（`next.config.ts:45`）。
- 問題: Vercelアクセスログ・ブラウザ履歴・（サードパーティスクリプト混入時）Referer にトークンが平文残留。
- 改善案: `Authorization: Bearer <token>` ヘッダ送信に変更し、サーバは `request.headers.get("authorization")` で取得。
- 深刻度: HIGH / ICE: I=4 C=5 E=4（13）

#### H27 safeEqual のタイミングリーク — SEC
- 現状: `if (a.length !== b.length) return false;` の後に `timingSafeEqual`。長さ不一致で即 return するため応答時間でトークン長を絞り込める。
- 改善案: 長さ判定も定数時間に寄せる（同長バッファへコピーしてから比較し、最後に長さ一致をAND）。H6の共通化と同時に1箇所で修正。
- 深刻度: HIGH / ICE: I=3 C=4 E=5（12）

#### H28 依存CVE（dompurify / next） — SEC
- 現状: `isomorphic-dompurify` 実体 3.4.1（hook汚染・SAFE_FOR_TEMPLATES/Shadow Rootバイパス系CVE）、`next ^16.2.1`（Server Components DoS・CSP nonce XSS・キャッシュポイズニング・WS upgrade SSRF）。AI生成HTML→`sanitizeNewsHtml`→`dangerouslySetInnerHTML` 経路があるためXSS面が実在。
- 改善案: `npm audit fix`／`dompurify` 3.4.11+、`next` 16.3.0+（互換確認後）へ更新。横断ハードニングは既存 Issue #7 に集約。
- 深刻度: HIGH / ICE: I=4 C=4 E=5（13）

#### M16 / L4 / L5（中〜低）
- **M16** `apiError.ts:23` のNotionエラー判定が正規表現照合で脆く、一時障害を恒久設定不備(500)に誤分類しうる→ Notionの構造化フィールド（`code: "validation_error"`）で判定。`safeJson.ts:17` が非JSONを `{}` に潰し、502/504等を一律「保存に失敗しました」に丸める→ `res.status` を文言に含める。
- **L4** `featureFlags.ts` に `server-only` が無く client から直接 import され、認証フラグ値がバンドルに露出→ サーバ判定をAPIレスポンス（`authRequired`）で渡し、認証フラグは `server-only` 化。
- **L5** `apiError.ts:55` がNotionプロパティ名をHTTP 500本文で外部返却→ 汎用文言＋詳細はサーバログのみ。
- 追加（SEC-07/SEC-10）: APIにレート制限なし（ブルートフォース/アップロードDoS）、`/api/growth/**` に `nosniff`/HSTS/`X-Frame-Options` 等が未付与 → Middleware でIPレート制限、全ルートにセキュリティヘッダ付与。

### 3.2 信頼性・仕様（pull型ループの背骨）

#### C2 pull型「依頼中」永久詰まり＋死活監視がPC内のみ — SPEC,QA
- 現状: 全AIループの `selectStale*Ids` は `status === "処理中"` のみ回収（`advise.ts:234`,`revise.ts:284`,`eyecatchRegen`/`bodyImageRegen` 同型）。reaper(15分)も「処理中」限定。さらに reaper は常時稼働PCの CLI（`*-cli.ts` の `reap`）でしか動かない。
- 問題: 最頻障害＝「PCのループが止まっている」とき、行は **「依頼中」のまま**遷移せず reaper の対象外。APIは busy として409で再依頼拒否、画面は `revisePhase.ts:15` の pending を出し続け、「やり直し(discard)」も提示中/失敗のみ許可で不可（`revise/apply/route.ts:103`）。三重ロックのデッドロック。回収者と被回収者が同一ホストのため「PCが落ちたら失敗化」が原理的に成立しない。「沈黙させない」要件が中核で破綻。
- 改善案: (1) reaper の対象に「依頼中 かつ `依頼時刻`から閾値超」を追加（依頼時刻は全機能で記録済み＝回収可能）。(2) 本質対応として**死活監視を Vercel cron route に外出し**（PC最終巡回時刻を Notion に書き、画面が古ければ全体警告）。(3) 画面側で「依頼中」が閾値超なら discard を許可。
- 深刻度: CRITICAL / ICE: I=5 C=5 E=3（13）

#### C3 Notion↔microCMS ミラー片落ち — SPEC
- 現状: `draft/edit/route.ts:124-143`・`draft/eyecatch/route.ts:110-124` は「Notionミラー先→microCMS後」の2フェーズ書込。後段失敗で502を返すが「再保存で冪等上書き」前提。
- 問題: 再保存しない/できないと **Notionミラー(プレビュー正本)=新・microCMS下書き=旧** の恒久ズレ。承認画面は新を見せ、`publish` は microCMS下書き＝**旧本文を本番公開**。AI系(advise/decorate/body-regen)は新ミラーを読むためズレが増幅。整合検証・修復手段が無い。
- 改善案: 公開前に Notionミラーと microCMS下書きのハッシュ一致を検証し、不一致なら**公開ブロック＋「再同期」操作**を提供。
- 深刻度: CRITICAL / ICE: I=5 C=4 E=4（13）

#### H9 段階ガード不在 — SPEC
- 現状: 各依頼API（`revise/route.ts:106`,`eyecatch/regen/route.ts:85`,`advise/route.ts:85`,`draft/edit`）は**自機能の副ステータスしか見ず**、記事本体の段階（生成中/公開済み）を見ない。
- 問題: 「生成中」に下書き生成ループがNotionを上書きする最中、revise/advise の依頼書込が走り構成案・タイトル・本文ミラーが競合（SPEC-04）。「公開済み」に edit/eyecatch/regen が通り、下書きリビジョンだけ書換→公開版と乖離、または status=draft 上書きで公開記事が下書きに戻る恐れ（SPEC-05）。「生成中/公開済みに○○が来たら」が未定義。
- 改善案: 全依頼/編集APIで `deriveArticleStage` が generating/published のとき409＋明示エラー。再編集は「下書きに戻す」明示操作を介す。横断で1箇所のガードに集約。
- 深刻度: HIGH / ICE: I=5 C=4 E=4（13）

#### H10 楽観更新 `decided` の非リコンサイル — SPEC
- 現状: 承認/却下で `decided[id]=choice` をローカル蓄積（`ApproveClient.tsx:293`）。`effectiveStage`/`isActionable` がこれを参照。`pollBoard`(`:436`)・`refreshItems` は items を入替えるが **decided を一切リコンサイルしない**。
- 問題: ポーリングでサーバ最新stage（既にqueued/generating/drafted）を得ても古い `decided` が残り二重前進・操作不能ゴースト・件数バッジ不整合。`decided` はリロードまで単調増加。誤却下リカバリ不能（M14）とも連鎖。
- 改善案: pollBoard後に「サーバが既に前進済み/対象消失した id」を decided から除去。サーバ状態を信頼源にし、decided は未反映の楽観値だけ保持。
- 深刻度: HIGH / ICE: I=4 C=5 E=4（13）

#### H11 / H12 / H13 「待ち」の可視化・滞留検知・ポーリング継続 — UX,QA,SPEC
- 現状: 滞留検知 `isStuck`/`STUCK_THRESHOLD_MS` は `queued|generating` の記事カードのみ（`generating.ts:14`）。revise/advise/decorate/eyecatchRegen/bodyImageRegen/bodyComment の「依頼中/提示中」には滞留警告なし。盤ポーリングは `hasInFlight = isInFlight(stage)`（`:441`）が真の時だけ起動し、**AI副ステータスを見ない**ため、ドロワーを閉じた状態の提示完了を取りこぼす。修正待ちは「最大5分で提示します」の楽観文言を無期限に出す（`:1799`）。
- 問題: pull型の最大弱点「いつ返るか不明」が放置され、提示が届いても気づけない／固まっても警告されない。提示中放置でその記事は全AI依頼がロック（SPEC-06）。
- 改善案: (1) 各ループ表示に `requestedAt` を載せ閾値超で共通の滞留警告（C2の死活と連動）。(2) in-flight 条件に「AIループが busy の記事」を含め盤ポーリングを継続。(3) 完了をトースト統合＋経過時間表示。(4) 「未確認の提示N件」サマリ。
- 深刻度: HIGH（3件統合）/ ICE: 平均 I=4 C=4 E=4（12）

#### H29 bodyComment reaper のステータス条件欠落 — QA
- 現状: 他5ループは `status === "処理中"` で絞るのに、`bodyComment.ts:377` の `selectStaleBodyCommentIds` は `requestedAt` のみでフィルタしステータス条件が無い。
- 問題: 正常に「提示中」でユーザー操作待ちの古い行まで stale 扱いになり、reaper が**誤って失敗化＋失敗通知**を撃つ恐れ。誤通知は「沈黙させない」設計の信頼を逆に損なう。明確な1行リグレッション。
- 改善案: 他ループと同じく `r.status === "処理中"` を必須条件に追加。
- 深刻度: HIGH / ICE: I=4 C=5 E=5（14）

#### H5 ポーリング失敗の完全沈黙 — UX,QA,FE
- 現状: `pollBoard`(`:416`)・`refreshDraftSilently`(`:553`) は失敗を `catch{return;}` で握り潰し回数も記録しない。`refreshItems` のエラーは無関係な「構成案の修正」枠(`reviseError`)に表示される文脈不一致もあり（FE-17）。
- 問題: 回線断・401失効・恒久500でも盤が前回値を「最新のように」表示し続け、停滞原因（回線/PC/サーバ）を切り分け不能。C2の停止を画面側からも気づけなくする。
- 改善案: 連続失敗カウンタを持ち、N回連続で「最新化できていません（最終更新 hh:mm）/再試行」の控えめバナー。401は再認証導線。`navigator.onLine` 併用。ポーリングエラー用に独立 state を用意。
- 深刻度: HIGH / ICE: I=4 C=4 E=4（12）

#### 仕様の中〜低（M13/M14 ほか）
- **M14** 却下の取り消しが盤に無い（`approve/route.ts:61` で却下を除外、`undo` はローカル decided 経由のみ）→ アーカイブ ビュー＋復帰操作、または直近却下のサーバ状態ベース undo。
- **M13** `stage.ts:44` 未知ステータスを proposed に倒すため、下書きIDがある進行中記事が「提案中」に巻き戻り再承認→二重生成の恐れ→ `hasDraftId` があれば未知でも最低 drafted にフォールバック。
- 追加（SPEC-03/07/09/12/14/15）: 承認POSTの部分成功が非トランザクションで盤とNotionがズレる→per-item結果を返す／body-image再生成は対象src実在を依頼時に検証＋per-image状態設計／revise apply の両提案空 conflict を「失敗」正規化／必須プロパティ欠落の fail-fast と欠落耐性の方針を機能横断で統一しボタン無効化＋理由表示／publish 冒頭で published なら409（冪等）／AI反映系は本文ハッシュ同梱でTOCTOU防止。

### 3.3 UI/UX

#### H1 公開ボタンがプレビューより上 — UX
- 現状: `ApproveClient.tsx:1990` 付近のDOM順が「アイキャッチ→AIアシスタント→公開/クローズ(`:1990`)→プレビュー幅切替→本番プレビュー本体(`:2049`)」。最終確認のプレビューより前に公開ボタン。
- 問題: 「確認してから公開」の逆。Tab順でも公開が先に来て誤公開リスク。
- 改善案: プレビュー本体を上、公開/クローズを最下部の最終アクションへ。`DraftChecklist` が全green でなければ公開を disable（H4と連動）。
- 深刻度: HIGH / ICE: I=4 C=4 E=3（11）

#### H2 公開確認が`window.confirm`・成功通知なし・冪等性なし — UX,FE,QA,SPEC
- 現状: `ApproveClient.tsx:759,781` が素の `window.confirm`。成功時は `pollBoard()` のみで明示通知なし。`publish/route.ts:80` に冪等ガード無し。
- 問題: ネイティブconfirmはブランド外観なし・iOS WebViewで不安定・タイトル文脈なし。最強権限の外向き操作なのに成功フィードバックが無く、ポーリングが固まっていると成否不明で二度押し→公開済みへ再patchDraft（手直しタイトル上書き・SPEC-14）。
- 改善案: タイトルを明記したカスタム確認ダイアログ（既存 `confirmDiscard` パターン流用）＋公開直後トースト「公開しました/取り下げる」。publish APIに冪等性（published なら409）。
- 深刻度: HIGH / ICE: I=4 C=4 E=4（12）

#### H8 モーダルのフォーカストラップ不在・3画面で挙動バラバラ — UX,FE
- 現状: 記事モーダル(`:2286`)・施策ドロワー(`:2329`)は `role="dialog" aria-modal="true"` のみで focus trap・背景スクロールロック無し。`DraftEditWorkspace`/`CommandPalette` は実装済みで挙動が3者3様。Escはグローバル頼みで閉じない条件分岐あり。
- 問題: フォーカスが背景の盤に残り Tab で承認/却下へ抜ける。SR/キーボード利用者が「下に盤がある」状態で誤操作。WCAG APG Modal 非準拠。
- 改善案: `useModalA11y`（初期フォーカス・focus trap・`body.overflow=hidden`・復帰フォーカス）に3画面統一。`DraftEditWorkspace` 実装を再利用。
- 深刻度: HIGH / ICE: I=4 C=4 E=3（11）

#### H16 微小フォント＋低コントラスト — UX
- 現状: `AdviceCard.tsx`・`InlineCommentReview.tsx:169,250`・`ApproveClient.tsx:2015` 等で `text-[10px]`〜`text-[11px]` が頻出、`text-gray-400` との組合せ多数。
- 問題: 10–11pxはモバイルで判読困難。`gray-400` on white は約2.8:1で WCAG AA(4.5:1) 未達。CLAUDE.md のA11y要件に直接抵触。
- 改善案: 本文系は最低12px(`text-xs`)、補助テキストの `gray-400` は `gray-500` 以上へ。重要情報を10pxに置かない。
- 深刻度: HIGH / ICE: I=4 C=4 E=3（11）

#### H17 単一キーショートカット誤爆 — UX
- 現状: `shortcuts.ts:29` の `a/r/e/j/k` を document 全体に bind（`:462`）。`isEditableTag` で input は抑止するが **contenteditable（TipTap等）は対象外**。`a` 単打で即「承認」。
- 問題: エディタ内やフォーカスが body の状態で `r` を押すと意図せず却下。即時保存モデルなので本番ステータスが変わる。発見性も低い（lg時のみ小さく1行）。
- 改善案: `target.isContentEditable` も抑止対象に。`?` でショートカット一覧モーダル。承認/却下は undo 可能を見える化。
- 深刻度: HIGH / ICE: I=4 C=4 E=3（11）

#### UXの中〜低（M3/M4/M6/M8/M9/M10/L1/L2/L3）
- **M3** 即時保存の承認/却下に確認なし・隣接ボタンで誤タップ即反映（`:736,1445`）→ 却下を outline 化し視覚差、トーストで「却下しました/取り消す」を前面化。
- **M4** 元 vs 新が `<pre>` 縦並びで差分ハイライト無し（`:1842`）→ 行/語句単位 diff（追加=緑・削除=赤）＋「N箇所変更」サマリ（WRITE-12と統合）。
- **M6** 詳細パネルにAdvice/装飾/画像/コメント/公開/プレビューを全縦積みで認知過多（`:1964,2300`）→ アシスタントをタブ/アコーディオン化し、公開はチェックリスト完了後のステップに分離、上部にフェーズ ステッパー。
- **M8** `copyText` がclipboard失敗を `.catch(()=>{})` で握り潰し成功時も無反応（`:1901`）→ 成否トースト（「沈黙させない」要件に抵触するQA指摘でもある／ICE高・易しい＝クイックウィン）。
- **M9** トーストが手動でしか消えず溜まる・aria-live が親に固定でない（`:278,2470`）→ 自動dismiss＋常設 `aria-live="polite"` 領域＋件数上限。
- **M10** 段階インジケータの1.5pxドットが a11y弱・非テキストコントラスト不足（`:1313`）→ `aria-label="進捗: 4段階中2(生成待ち)"`＋ステップ番号/ミニラベル。
- **L1** カンバン列が独立縦スクロールせず `sticky top-0` が活きない（`ArticlesView.tsx:51`）／**L2** 初期タブ未確定で施策→記事のちらつき（`:1195,380`）／**L3** タブ別・検索別の空状態とCTAが無い（`:1168` ほか）。

### 3.4 ライティング・記事品質

#### C5 NG語・AI定型の確定的linterが無い — WRITE
- 現状: `draftQuality.ts` のチェックは文字数・見出し・画像・内部リンク・タイトル長の5項目のみ。§6「誇大・煽り」、§14「翻訳調・AI定型・同語多発・括弧書き直訳」の機械検出が皆無で、検出は唯一AI往復(advise)依存。
- 問題: AI記事の品質を最も落とす欠陥群を、最も機械化しやすいのに最も重い導線（数分待ちのAI）に押し込んでいる。確定的 linter なら0秒・無料・100%再現。
- 改善案: §6/§14 のNG語・定型句を辞書化した linter を追加し、本文プレビュー上でインラインハイライト＋ホバー理由表示、「誇大語/AI定型/括弧書き直訳/同語多発」をカテゴリ別カウントで公開前チェックに並べる。advise(AI)は文脈判断の上位レイヤーに専念。
- 深刻度: CRITICAL(品質) / ICE: I=5 C=4 E=3（12）

#### H3 文字数下限800字（§2は1,500字） — WRITE
- 現状: `draftQuality.ts:23` `minChars: 800`。§2は単発1,500〜2,500字・cornerstone 3,000〜5,000字。
- 問題: 800字で緑が点き「チェック通過＝十分な厚み」と誤認させる最大の穴。記事タイプ区別も無い。
- 改善案: 下限1,500字へ。Notionで記事タイプを持たせタイプ別しきい値（1,500/3,000）。上限超過は「水増し疑い」で黄。
- 深刻度: HIGH / ICE: I=5 C=5 E=4（14）

#### H4 チェックが黄止まり・公開ブロック不在 — WRITE
- 現状: `draftQuality.ts:13` は `ok: boolean`（緑/黄のみ）。重大違反でも「要確認(黄)」で無視して公開可能。
- 問題: §5免責欠落・§13時期ズレ断定・壊れ内部リンクのような「公開してはいけない」違反が、軽微warnと同じ黄に埋もれる。CLAUDE.md の重大度（CRITICAL=BLOCK）思想が品質チェックに未反映。
- 改善案: 3段階（赤=公開ブロック/黄=要確認/緑=OK）化。赤がある間は公開ボタン無効（明示オーバーライド要求）。§5免責・§13断定・壊れリンクを赤に分類（H1/H2の公開導線と連動）。
- 深刻度: HIGH / ICE: I=5 C=4 E=4（13）

#### H18 §5「AI下書き免責文」の有無を未チェック — WRITE
- 現状: §5は末尾に「※この記事はAIが作成した下書きです」を必須とするが、`draftQuality.ts:63` のチェック項目に無い。
- 改善案: 末尾免責文の存在チェック（正規表現一致）を1項目追加。出典帰属（統計記事で「◯◯によると」の近接）も将来候補。
- 深刻度: HIGH / ICE: I=4 C=5 E=5（14）

#### H19 内部リンクの実在/壊れリンク検証なし — WRITE
- 現状: `draftQuality.ts:48` は `/` 始まり/自社ホストを数えるだけ。リンク先実在（§15）は未検証で、1本あれば緑。
- 問題: AIは `/ja/news/<slug>` を捏造しがち。壊れ内部リンクが緑のお墨付きで公開されブランド毀損（§15）。上限超（詰め込み）も未検出。
- 改善案: slug実在を microCMS/サイトマップ照合で検証し未解決リンクを赤。外部 `<a>`（§15原則禁止）・不完全URLも警告。
- 深刻度: HIGH / ICE: I=4 C=4 E=4（12）

#### H20 メタディスクリプション(excerpt)編集UIが無い — WRITE
- 現状: `scripts/growth/draft-meta.ts:49` は excerpt を読むだけ。承認画面に編集導線なし。
- 問題: 検索スニペット＝CTRの一等地を人が整えられず、AI任せの抜粋がそのまま検索結果に出る。
- 改善案: 承認画面に excerpt 編集（120字目安カウンタ付き）＋本文/まとめからの自動下書き＋手動上書き。公開前チェックに「メタ説明の長さ」追加。
- 深刻度: HIGH / ICE: I=4 C=4 E=4（12）

#### H21 §13 時期ズレ・doNotWrite断定の機械検出なし — WRITE
- 現状: §13は人手チェックに丸投げ。`facility-context.json` の `doNotWrite`（料金・営業時間・各駅所要分・コート面数）の断定や開業前/済みと矛盾するトーンを検出する仕組みが無い。
- 問題: §13自身が「過去の時期ズレ事故の再発防止」と書くほどの重大リスクを人の注意力だけで防いでいる。
- 改善案: `doNotWrite` 由来パターン（「◯分」「◯円」「◯時」「コート◯面」）を本文検出して警告。開業日と基準日から算出した「開業前/済み」と矛盾するトーン語も検出。公開前チェックに最優先で追加。
- 深刻度: HIGH / ICE: I=5 C=4 E=4（13）

#### H22 用語統一（表記ゆれ）検出なし — WRITE
- 現状: 「パドル/ラケット」（§9で厳密区別）「本八幡/本八幡駅」「ですます/である」等の表記ゆれ検出・統一機能が無い。
- 問題: プロ校正に必須の用語集チェックがそっくり欠落。
- 改善案: プロジェクト用語辞書（正：ピックルボール／パドル=ピックルボール用、ラケット=テニス用 等）を定義しゆれをハイライト＋一括置換候補。文体混在も検出。
- 深刻度: HIGH / ICE: I=4 C=4 E=4（12）

#### ライティングの中（M4統合・M5・WRITE-07/10/11/15/16）
- **M5** インラインコメント before/after が `replace(/<[^>]*>/g,"")` でタグ除去のため、`<aside>`追加やリンク挿入が「同じに見える」まま「本文へ反映」を押させる（`InlineCommentReview.tsx:196`）→ 安全レンダリングかタグ可視化で構造変化を見せる。
- **WRITE-11** advise の `axis` が自由文（`advise.ts:52`）で §11 の9軸が毎回採点される保証が無く記事間比較不能 → `axis` を9軸 `z.enum` に固定し欠け軸を「未採点」明示。
- 補足: §1段落リズム（最長文/5文超段落/見出し間隔）の機械チェック、§14同語多発の頻度ヒストグラム、§9アイキャッチ焼き込み文字の人手OKトグル、数値の出典裏取りチェックリスト、も品質に効く追加候補。

### 3.5 エンジニアリング（保守性・性能・型）

#### H7 ApproveClient.tsx 2537行・useState48・render*11個の単一巨大化 — FE
- 現状: 1コンポーネントに useState 48・useEffect 11・内部render関数 11・ハンドラ 33。`openId` 変更時に12個の setState を1 effectで連発（`:341`）。
- 問題: 状態グループ（outline編集/画像指示/修正ループ/下書き編集）が相互干渉し副作用範囲が追えない。本レビューの多くの温床（M1 bulkDecide / M2 render再生成 / H5 ポーリング / H10 楽観更新）の根本原因。
- 改善案: `useReviseSection()`/`useDraftEditor()`/`usePolling()` 等のカスタムフックへ状態と副作用を分離、`RevisePanel`/`DraftPreviewPanel`/`ArticleCard`/`ProposalCard` を独立コンポーネント抽出。パネルの transient state は `useReducer` で `CLOSE_PANEL` 1発リセット。
- 深刻度: HIGH / ICE: I=5 C=4 E=4（13・段階的に着手）

#### H14 / H15 型の緩さ — FE
- **H14** `json.items as PendingItem[]`／`json.draft as DraftPreview`（`:219,534,561`）はランタイム検証なし→ zodスキーマ(`PendingItemSchema`/`DraftPreviewSchema`)で `parse`、規約「unknown+narrow」に整合。
- **H15** ローカル `PendingItem`(`:119`)が lib公開型(`lib/growth/approve.ts:23`)より緩く（optional化・string化）`!` 非null assertion増殖、`reviseStatus` の union 型が失われ網羅チェックが効かない→ ローカル型を削除し lib型を直接利用。
- 深刻度: HIGH / ICE: I=4 C=4 E=4（12）

#### M1 / M2 / M7（性能・正しさ）
- **M1** `bulkDecide` が `forEach(void decide(...))` で並列 fire-and-forget、`savingId` 単一で保存/失敗表示が崩れる（`:1230`）→ 一括APIに集約 or in-flight `Set`＋件数進捗（n/m, k失敗）。
- **M2** render*関数が毎描画再生成で子の `React.memo` を無効化、画像/コメントに `key={idx}`（`:1285,1542,1649`）→ `ArticleCard`/`ProposalCard` 抽出、key を安定IDへ（編集中textareaのfocusズレ防止）。
- **M7** 承認GETの2クエリ逐次await（`approve/route.ts:86`）・POSTのN+1更新（`:128`）・全件取得に `has_more` surfacing無し（`:87`）→ `Promise.all` 並列化（必要なら `p-limit`）、100件超を警告。タブ非表示時はポーリング停止（`visibilitychange`）。
- 深刻度: MEDIUM

### 3.6 事業（ループの背骨）

#### C4 記事別の効果測定が無くループが閉じていない — BIZ
- 現状: GA4/GSCを週次取得するが digest はサイト全体4値のみ（`scripts/growth/digest.ts`）。`topPages`/`landingPages` を取りながら公開記事・ネタ案にひも付けていない。承認画面に記事別指標カードが無い。
- 問題: 「どの記事が客を連れてきたか」が分からず、効いた記事の横展開という最高ROIの判断ができない。"グロースループ"を名乗るのに計測→意思決定の環が閉じていない。
- 改善案: 公開時に記事↔microCMS↔Notionネタ案のIDを保持しGA4 `pagePath` で記事別PV/流入/検索順位を結合、承認画面の各記事カードに「公開後28日：流入/掲載順位/上位クエリ」を表示。最低限「公開済み記事の成績ボード」を1枚作る。
- 深刻度: CRITICAL(事業) / ICE: I=5 C=4 E=3（12）

#### H23 / H24 属人化・配信平準化 — BIZ
- **H23** ネタ承認〜下書きトリガー〜編集〜各種AI依頼〜公開まで単一人物が全件手動。バックアップ運用者・移譲手順なし→ この人が1週間離れると公開ゼロ。10倍化で承認クリックが律速。→ `draftQuality` 全green＆スコア閾値超は「一括承認・予約公開」許可、運用手順1枚化＋第二運用者、役割を「全件レビュー」から「例外（赤だけ）レビュー」へ。
- **H24** 公開は即時PUBLISHのみで予約公開・編集カレンダー無し（`publish/route.ts`）→ 在席日にまとめて公開→空白週の波。microCMS予約公開で公開日指定＋簡易カレンダーでストック平準放出。
- 深刻度: HIGH / ICE: I=4 C=4 E=3〜4（13）

#### 事業の中（M11/M12/M15・BIZ-02/06/07/08/10）
- **M11** 公開がmeta/OGP/構造化データ未設定（`publish/route.ts`）→ ローカルSEO(市川/本八幡×屋内)が効く領域なので LocalBusiness 構造化データ＋meta/OGP自動付与。
- **M12** advise/decorate/advise-apply の3機能＋3常駐ループはROIに対し過剰 → 1機能統合＋装飾はデフォルト自動付与＋人手スキップ可へ降格、浮いた工数を計測(C4)へ。常駐ループ7本＋自宅PC集約も単一障害点（1ワーカー統合＋装飾系オンデマンド化）。
- **M15** リライト（既存記事改善）動線が無い → 順位11〜20位の伸びしろ記事を週次抽出しリライト案として承認画面に積む（新規量産より高ROI）。
- 補足: 計測→ネタ選定のフィードバック（GSC実需要をweekly生成に注入）、ネタ優先度の需要データ接続、記事末尾の計測可能CTA（開業前はLINE登録を中間KPI）、内部リンクの自動提示（トピッククラスタ化）、事業KPI/目標本数の明文化（runbookに無い）。

---

## 4. クイックウィン vs 大改修

### クイックウィン（低工数 × 高インパクト・まず着手）
- **C1** 認証フラグの env 化＋フェイルセーフ既定（1行＋CIガード）— 本番公開の絶対前提。
- **H29** bodyComment reaper に `status === "処理中"` 条件追加（1行・誤失敗通知の回帰）。
- **H6/H27** `safeEqual`/`verifyToken` 共通化＋タイミングリーク修正（1モジュールに集約）。
- **H28** `npm audit fix`（dompurify/next 更新・互換確認後）。
- **H3** `draftQuality` の `minChars` 800→1,500（しきい値1つ）。
- **H18** §5免責文の存在チェック1項目追加。
- **M8** `copyText` の成否トースト（沈黙解消・易しい）。
- **H1** 詳細パネルのDOM順入替（公開ブロックを最下部へ）。
- **L4/L5** featureFlags の `server-only` 化／エラー文言の汎用化。

### 腰を据えた大改修（設計判断・段階着手）
- **C2** pull型死活監視を Vercel cron へ外出し＋「依頼中」reaper 回収＋画面の停止可視化（信頼性の中核）。
- **C3** Notion↔microCMS のハッシュ整合検証＋公開ブロック/再同期（外向き公開の正しさ）。
- **C4** 記事↔GA4↔Notion のID連結と成績ボード（"ループ"を閉じる事業投資）。
- **C5/H4/H19/H21** 公開前チェックを「確定的linter＋3段階＋公開ブロック」に再設計（品質ゲート化）。
- **H7** ApproveClient.tsx のフック分離・コンポーネント抽出（多数の温床の根本対処）。
- **H8** モーダルA11y統一フック。**H9/H10** 段階ガード集約＋楽観更新リコンサイル。
- **H23/H24** 例外管理型ワークフロー＋予約公開（属人化解消・スケール）。

---

## 5. 付録：出典レンズ対応と注記

- 横断的に複数レンズが独立に指摘した項目（信頼度が特に高い）: **C1**(SEC/FE)、**C2**(SPEC/QA)、**H2**(UX/FE/QA/SPEC)、**H5**(UX/QA/FE)、**H6**(SEC/FE)、**H8**(UX/FE)、**H11-13**(UX/QA/SPEC)、**M4**(UX/WRITE)、**M8**(UX/FE)。
- 各レンズが評価した「良い点」: pull型の安全機構（excerpt/block照合・zod検証・read-only分離・`growthApiError` で必ず `console.error`・stale回収の土台）は堅牢。装飾/アドバイスの「AIに生HTMLを出させない」設計、CONTENTキー/MANAGEMENTキーの使い分け方針は良好。今回の指摘は主に「①本番公開ゲート（認証）②pull型の死活・可視化③品質チェックの確定化と強制力④事業ループの閉鎖」に集中。
- 本レビューは **読み取り専用**。コードは一切変更していない。ICE・深刻度はメインの統合判断であり、着手順は事業状況に応じて調整のこと。未確認の前提（例: 本番の実 `APPROVE_AUTH_ENABLED` 値、microCMS管理画面のSVG許可設定、実依存バージョンの最終確認）は導入前に各担当が確認すること。
