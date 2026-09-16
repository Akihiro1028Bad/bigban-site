# ホームのイントロをロゴのみに差し替える — 設計書

- 日付: 2026-09-16
- 対象ブランチ: `fix/disable-home-intro` (PR #481 に追加コミットで乗せる)
- 前提設計書: `docs/superpowers/specs/2026-09-16-home-intro-disable-design.md`
- ステータス: 設計合意済み / 実装計画待ち

## 1. 背景と目的

ホーム (`/`・`/en`) 初回訪問時のイントロについて、オーナーの意向は
「**ワープ演出は要らないが、その最後に出るロゴは残したい**」。

PR #481 でイントロを丸ごと OFF にしたが、これをロゴだけのイントロへ差し替える。
ロゴの出方は**これまで本番で流れていたものをそのまま使う**。新しい動き
(下から上へのスライド、グローの点灯など) は足さない。

### 検討した案

| 案 | 内容 | 判定 |
|---|---|---|
| 1 | ロゴ段を現状のまま流用 (フェードイン + `scale 0.9→1`、0.5s) | **採用**。PR #481 は未マージなので今も本番で流れている演出そのもので、見え方の実績がある。canvas を外すだけで済み、調整の往復が要らない |
| 2 | フェードインに加えて下から 20px ほど上へ移動させる | 不採用。「浮かび上がる」に寄せた新しい動きで、距離と時間の調整・検証が要る。今回の目的は既存の演出を残すことなので、変更点を増やさない |
| 3 | ロゴ周囲のグローを弱→強へ点灯させる | 不採用。ネオンらしさは出るが実装量が最も多く、ブランドの見え方を変える判断が別途必要になる |

案 2・3 は将来やりたくなったときに案 1 の上へ足せる。先に足す理由が今はない。

## 2. 現状

### 2-1. develop (PR #481 マージ前)

| 段 | 中身 | 長さ |
|---|---|---|
| 前半 | `StarfieldWarpIntro` の canvas: drift → accel → hyperspace → burst | 4700ms |
| 後半 | 黒背景の上にロゴ (`opacity 0→1` + `scale 0.9→1`) → 静止 → フェードアウト | 約 1300ms |

canvas が `onPhaseChange("content")` を投げた瞬間に後半へ移る。
`HomeIntro` の phase 管理 (`dark → converge → explode → content`) は
**すべて canvas の進行を待つための仕組み**。

### 2-2. PR #481 適用後 (このブランチの現在)

- `page.tsx` から `<HomeIntro>` の囲みを削除 = イントロ再生なし
- `PreHydrationScripts` は `shouldPlayIntro` 既定 `false` = `intro-pending` を出力しない
- `HomeIntro` / `StarfieldWarpIntro` とそれらのテストは未削除のまま残っている

### 2-3. 時間の実測値 (重要)

`LOGO_HOLD_MS = 800` は「ロゴの登場 0.5s + 静止 0.3s」を合わせた値で、
そこから退場フェードが 0.5s かかる。よってロゴ段の所要は **約 1.3 秒**。

```
0ms         500ms       800ms            1300ms
|--登場0.5s--|--静止0.3s--|----退場0.5s----|
             ↑ opacity/scale 完了        ↑ unmount
```

## 3. スコープ

### やること

- `HomeIntro` から `StarfieldWarpIntro` の呼び出しと phase 管理を取り除き、マウント直後にロゴを出す
- `prefers-reduced-motion` の判定を `HomeIntro` 自身に持たせる (後述 4-3)
- フェイルセーフを 6000ms → 3000ms に短縮
- イントロ再生中のスクロールを固定する (後述 4-7)
- `layout.tsx` を `<PreHydrationScripts shouldPlayIntro />` にする
- `page.tsx` を `<HomeIntro>` で囲み直す
- 上記に対応するテストの修正
- PR #481 のタイトル・説明文を「ロゴのみのイントロへ差し替える」内容に書き直す

### やらないこと

- `src/components/intro/StarfieldWarpIntro.tsx` とそのテストの削除・変更
  — `/teaser` (`src/app/[locale]/teaser/TeaserPage.tsx:52`) が使い続けるため。ティザーのワープは現状維持
- ロゴの動きの変更 (スライド追加・グロー追加・画像差し替え)
- ロゴの表示時間の変更 (`LOGO_HOLD_MS = 800` を維持)
- イントロの表示条件の変更 (1 セッション 1 回・ホームのみ)
- ブランチ名の変更 (`fix/disable-home-intro` のまま。push 済みのため)
- ホームのセクション順序・構成の変更

### PR のサイズについて

CLAUDE.md は PR を 400 行以内としているが、PR #481 は本設計書を加える時点でこれを超える。
内訳はほぼ設計書と実装計画で、コード差分は 100 行未満に収まる見込み。
**PR 説明にコード差分とドキュメント差分の内訳を明記し、レビュー範囲を誤解させない**こと。
分割しないのは、ロゴイントロの設計と #481 の OFF 化が同じ 2 か所を触るためで、
別 PR にすると必ずコンフリクトし、レビューでも両方を並べて読む必要があるため。

## 4. 設計

### 4-1. 新しいタイムライン

```
マウント → ロゴ登場 0.5s → 静止 0.3s → 黒背景ごと退場 0.5s → 本編
合計 約 1.3 秒 (従来は canvas 4.7s + 1.3s = 約 6 秒)
```

### 4-2. `HomeIntro` の簡素化

| 要素 | 現在 | 変更後 |
|---|---|---|
| `StarfieldWarpIntro` の import と canvas レイヤー | あり | **削除** |
| `phase` state と `AnimationPhase` 型 | あり | **削除** (canvas の進行を待つ必要がなくなるため) |
| `handlePhaseChange` コールバック | あり | **削除** |
| ロゴ表示の条件 | `phase === "content" && !isIntroComplete` | `!isIntroComplete` |
| `sessionStorage` への記録 | `phase === "content"` 時 | **マウント時の effect (`shouldShowIntro` が true のときだけ)** |
| `LOGO_HOLD_MS` タイマーの起点 | `phase === "content"` 受信時 | **マウント時** |
| `logoHoldTimerRef` による cleanup | あり | **維持** (1.3 秒以内の離脱で unmount 後 setState を防ぐ) |
| `useSyncExternalStore` による mount 判定 | あり | **維持** (SSR で イントロを描かないため) |
| `intro-pending` クラスの除去 | マウント時 | **維持** |
| `FALLBACK_UNMOUNT_MS` | 6000 | **3000** |

`sessionStorage` への記録は **`shouldShowIntro` が true のときだけ**行う。false のとき
(再訪・reduced-motion・`sessionStorage` 利用不可) に書き込むと、セッション途中で
reduced-motion を解除したユーザーにイントロが出なくなる。early return より前に置く
effect の中で、`shouldShowIntro` を見て分岐すること (フックの呼び出し順を崩さないため)。

ロゴレイヤーの JSX (`initial={{ opacity: 0, scale: 0.9 }}` → `animate={{ opacity: 1, scale: 1 }}`、
`exit={{ opacity: 0 }}`、`transition={{ duration: 0.5, ease: EASE }}`、`z-[101]`、`bg-black`、
`yoko-neon.png` 360×80 `priority`) は**一切変更しない**。黒背景レイヤー (`z-[100]`) も現状維持。

### 4-3. `prefers-reduced-motion` の判定役を移す

現在この判定を持っているのは `StarfieldWarpIntro` で、reduce のときは canvas を描かず
即 `onPhaseChange("content")` を呼ぶ。canvas を外すとこの判定役がいなくなるため、
`HomeIntro` の `shouldShowIntro` 初期化時に判定を追加する。

```tsx
const [shouldShowIntro] = useState(() => {
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    return sessionStorage.getItem(SESSION_KEY) !== "true";
  } catch {
    return false;
  }
});
```

reduce のときは**イントロごとスキップ**する (ロゴを静止表示することはしない)。
`PreHydrationScripts` の `introScript` も同じ条件で `intro-pending` を付けないため、
挙動は一致する。

### 4-4. フェイルセーフを 3000ms にする

演出全体が 1.3 秒で終わるのに 6 秒の保険は長すぎる。万一ロゴ層が畳まれない事故が
起きたときに画面が覆われ続ける時間を短くする。

`PreHydrationScripts` の `introScript` 内にある 6 秒の DOM レベルのフェイルセーフは
**6000ms のまま据え置く**。こちらは `HomeIntro` がマウントしない最悪ケース (JS エラー等) の
最終防衛線。

**2 つのタイマーは起点が違う**ので、順序は自動的には保証されない。6000ms は SSR HTML の
スクリプト実行時 (ページ読み込み) が起点、3000ms は `HomeIntro` のマウント時
(ハイドレーション後) が起点なので、ハイドレーションに 3 秒以上かかる環境では
`HomeIntro` 側が後になる。そのときの実害は「黒い覆いが最大で マウント + 3 秒 まで残る」
ことだけで、`intro-pending` は 6 秒で必ず剥がれるため `main` が隠れ続けることはない。
**ハイドレーションが 3 秒以内という前提の上で順序が成り立っている**ことを承知のうえで
この値にする。

### 4-5. `layout.tsx` と `page.tsx`

- `src/app/[locale]/layout.tsx`: `<PreHydrationScripts />` → `<PreHydrationScripts shouldPlayIntro />`
- `src/app/[locale]/page.tsx`: `<>` を `<HomeIntro>` に戻し、import を復活。
  PR #481 で入れた「イントロは一旦 OFF」コメントは差し替える

### 4-6. `PreHydrationScripts` は変更しない

`shouldPlayIntro` prop は PR #481 で導入済み。`layout.tsx` 側で `true` を渡すだけで足りる。
コメントの「現在 OFF」という記述だけ現状に合わせて直す。

### 4-7. イントロ中のスクロールを固定する

`visibility: hidden` はレイアウトを保つため、`main` が見えない間もページの高さは残り、
スクロールできてしまう。イントロが明けたときにページ途中から始まる可能性があるので、
再生中はスクロールを止める。

ハイドレーション前後で担当が入れ替わる 2 段構えにする。`intro-pending` は `HomeIntro` が
マウントした時点で外れるため、これだけではロゴ表示中のロックが途切れる。

| 期間 | 担当 | 付けるもの |
|---|---|---|
| ハイドレーション前 | `introScript` (既存) | `html.intro-pending` |
| マウント〜イントロ完了 | `HomeIntro` (新規) | `html.intro-scroll-lock` |

`src/app/globals.css` に次を足す (既存の `html.intro-pending main` はそのまま)。

```css
html.intro-pending,
html.intro-scroll-lock,
html.intro-pending body,
html.intro-scroll-lock body {
  overflow: hidden;
  /* Android Chrome の pull-to-refresh でイントロ中にリロードされるのを防ぐ */
  overscroll-behavior: none;
}
```

`HomeIntro` は `shouldShowIntro && !isIntroComplete` の間だけ `intro-scroll-lock` を付け、
`isIntroComplete` と unmount の両方で必ず外す。`intro-pending` の除去と
`intro-scroll-lock` の付与は同じコミットで入れ替わるため、ロックが途切れる瞬間はない。

**既知のトレードオフ**: クラシックスクロールバー環境 (Windows・Linux) では、ロック解除の
瞬間にスクロールバーが復帰して幅が ~15px 変わる。解除は黒背景のフェードアウトと同時なので
ほぼ目立たない。`scrollbar-gutter: stable` は `overflow: hidden` でスクロールコンテナ自体が
消えるためビューポートには効かない。完全に消すならスクロールバー幅を実測して
`padding-right` で補正する必要があるが、1.3 秒の演出に対して割に合わないため採用しない。

## 5. テスト方針 (TDD: Red → Green)

| ファイル | 変更内容 |
|---|---|
| `src/app/globals.css` | テスト対象外 (CSS)。`intro-scroll-lock` のクラス付与・除去は `HomeIntro.test.tsx` で検証する |
| `src/components/home/HomeIntro.test.tsx` | 下記に加えて「イントロ中は `intro-scroll-lock` が付き、完了時と unmount 時に外れる」を追加。phase 前提のケース 3 件 (「content以外のフェーズではロゴを表示しない」「contentフェーズに入った瞬間に canvas が unmount される」「content フェーズが連続発火しても hold timer がリークしない」) を削除。「マウント直後にロゴを表示する」「`prefers-reduced-motion: reduce` ならイントロを表示しない」を追加。既存の sessionStorage 保存 / スキップ / children 表示 / `intro-pending` 解除 / sessionStorage エラー時スキップ は残す。フェイルセーフのケースは 6000ms → 3000ms へ |
| `src/app/[locale]/layout.test.tsx` | `PreHydrationScripts` に `shouldPlayIntro` が渡ることを検証するケースを追加 (現在の mock は `() => null` で props を見ていないため、props を記録する mock に変える) |
| `src/app/[locale]/page.test.tsx` | PR #481 で追加した「イントロ演出 (StarfieldWarp の canvas) を描画しない」ケースを削除し、`HomeIntro` の passthrough mock を戻す |
| `src/components/PreHydrationScripts.test.tsx` | 変更なし (prop の両分岐を検証済み) |
| `src/components/intro/StarfieldWarpIntro.test.tsx` | 変更なし (`/teaser` が使用中) |

`page.test.tsx` の canvas 検証は、ロゴのみのイントロでは canvas が存在しないため
「イントロの有無」を判定できなくなる。役割を終えたので削除する。

## 6. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| `layout.tsx` に `shouldPlayIntro` を渡し忘れる | `intro-pending` が付かず、ロゴの裏でヒーローが先に見える (FOUC) | layout のテストで prop を検証する |
| 逆に `page.tsx` の囲みを戻し忘れて `shouldPlayIntro` だけ渡す | `intro-pending` を誰も剥がさず、6 秒間の真っ黒画面 | 2 つを同一コミットで変更する。手動確認でも初回表示を必ず見る |
| reduced-motion の判定漏れ | アニメーション抑制設定のユーザーに 1.3 秒の演出が出る | `HomeIntro` の初期化に判定を入れ、テストで検証する |
| `StarfieldWarpIntro` を未使用と誤認して削除 | `/teaser` が壊れる | 「やらないこと」に明記。テストも残す |
| `HomeIntro` の phase 削除で `AnimationPhase` 型が孤立 | 型は `/teaser` が使い続けるので影響なし | `src/components/teaser/types.ts` は触らない |
| **LCP が約 1.3 秒後退する** | `intro-pending` が `main` を `visibility: hidden` にする間、ヒーロー画像は LCP 候補にならない。CLAUDE.md の LCP < 2.5s を割る可能性がある | **コストを承知のうえで受け入れる**。§7 の完了条件に Lighthouse での LCP 実測を入れ、目標を割った場合はイントロの表示時間短縮か取り下げを再検討する |
| `intro-scroll-lock` が外れ残る | ページがスクロールできないまま固まる | 完了時と unmount の両方で除去し、テストで検証する。最悪でも `HomeIntro` 側 3000ms のフェイルセーフで `isIntroComplete` になり解除される |

## 7. 完了条件

- `npx tsc --noEmit` / `npm run lint` / `npm run test:coverage` (100%) / `npm run build` がすべて green
- `sessionStorage` をクリアした状態で `/` と `/en` を開くと、**星もフラッシュも出ず、黒画面にロゴだけが浮かび上がって約 1.3 秒で本編に入る**
- リロードでは再生されない (同一セッション 1 回)
- `prefers-reduced-motion: reduce` ではイントロが出ず、即ヒーローが表示される
- イントロ中はスクロールできず、明けた直後はページ先頭から始まる
- `/teaser` のワープ演出が従来どおり動く
- **Lighthouse (モバイル) でホームの LCP を実測し、2.5s 未満であることを確認する。**
  2.5s を超えた場合は、ロゴの表示時間短縮かイントロ取り下げをオーナーと再検討する
- PR #481 のタイトルと説明文が差し替え後の内容になっている。説明文にコード差分と
  ドキュメント差分の内訳を書く

## 8. やめる場合

ロゴイントロが気に入らなかった場合は、PR #481 をまるごと revert すれば
develop の状態 (ワープ + ロゴ) に戻る。ロゴイントロだけをやめて「イントロなし」に
したい場合は、`docs/superpowers/specs/2026-09-16-home-intro-disable-design.md` の
設計に戻す — 具体的には次の 3 点。

1. `page.tsx` の `<HomeIntro>` 囲みと import を外す
2. `layout.tsx` を `<PreHydrationScripts />` (prop なし) に戻す
3. `globals.css` の `intro-scroll-lock` セレクタは残してよい (クラスが付かなくなるだけ)

`HomeIntro` / `StarfieldWarpIntro` は削除しないので、どの方向にも戻せる。
