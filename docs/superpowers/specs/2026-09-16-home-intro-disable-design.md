# ホーム初回イントロ (StarfieldWarp) を一旦 OFF にする — 設計書

- 日付: 2026-09-16
- 対象ブランチ: `develop` から新規に切る (例: `fix/disable-home-intro`)
- ステータス: 設計合意済み / 実装計画待ち
- **本書は差し替え済み**: 後続の `docs/superpowers/specs/2026-09-16-home-intro-logo-only-design.md` に方針が引き継がれている。以下は経緯の記録として残す。

## 1. 背景と目的

ホーム (`/`・`/en`) を初回訪問したときに全画面で再生されるイントロアニメーション
(星が流れる → 加速 → フラッシュ → 衝撃波リング → ネオンロゴ、約 5.5 秒) を
**一旦表示しない**状態にする。

「一旦」であるため、コンポーネントやテストは削除せず、**配線だけを外して
いつでも戻せる状態**を維持する。

## 2. 現状 (develop 基準)

イントロは 2 か所で有効化されており、片方だけ止めると
「アニメは出ないのに `main` が `visibility:hidden` のまま = 真っ黒画面」になる。
必ずセットで扱う。

| # | 場所 | 役割 |
|---|---|---|
| 1 | `src/app/[locale]/page.tsx` L11 / L77 / L116 | `<HomeIntro>` で本文を包み、canvas 演出とロゴを再生する |
| 2 | `src/components/PreHydrationScripts.tsx` L18 | ハイドレーション前に `html.intro-pending` を付けて `main` を隠し、6 秒のフェイルセーフで剥がす |

関連ファイル:

- `src/components/home/HomeIntro.tsx` — 再生制御 (phase 管理・ロゴ表示・sessionStorage・フェイルセーフ)
- `src/components/intro/StarfieldWarpIntro.tsx` — canvas 本体 (drift → accel → hyperspace → burst)
- `src/app/globals.css` L40 — `html.intro-pending main { visibility: hidden }`

`intro-pending` クラスを付与するのは `introScript` のみで、剥がすのは同スクリプト内の
6 秒フェイルセーフと `HomeIntro` の `useEffect` の 2 経路。`introScript` を出力しなければ
そもそも付与されないため、`main` が隠れたまま残ることはない。

なお同種の演出はティザーページ (`/teaser`) にも存在する。
`src/app/[locale]/teaser/TeaserPage.tsx` が `StarfieldWarpIntro` を直接レンダリングしており、
`src/components/teaser/types.ts` の `AnimationPhase` 型を共有しているだけの関係ではない。
今回のスコープはホーム (`page.tsx` / `PreHydrationScripts`) のみで、ティザー側には手を入れない。

## 3. スコープ

### やること

- `page.tsx` から `<HomeIntro>` の囲みと import を外す
- `PreHydrationScripts` に `shouldPlayIntro`(既定 `false`) を追加し、既定では `introScript` を出力しない
- 上記 2 点に対応するテストの修正

### やらないこと

- `HomeIntro` / `StarfieldWarpIntro` / `globals.css` の intro 系 CSS の削除
- `HomeIntro.test.tsx` / `StarfieldWarpIntro.test.tsx` の削除
- ホームのセクション並び替えなど、手元の作業ツリーにある他の変更の持ち込み
- env フラグ (`NEXT_PUBLIC_*`) の新設
- 本番へのマージ・デプロイ (PR 作成まで。マージは人間が判断する)
- `vitest.config.ts` に残っている `BigBangCanvas.tsx` 向け istanbul プラグイン (対象ファイルは既に存在せず無害) の掃除 — 別件

## 4. 設計

### 4.1 方式の選択

採用: **呼び出し側の配線だけを外す (案 A)**。

| 案 | 内容 | 判定 |
|---|---|---|
| A | 呼び出しを外し、コンポーネントは残す | **採用**。差分が小さく意図が読める。未使用になるので canvas コードがバンドルから確実に落ち、JS 200KB 予算にも効く |
| B | `IS_HOME_INTRO_ENABLED = false` 定数で 2 か所を分岐 | 不採用。常時 false の分岐が残り、バンドルから落ちる保証がなく、カバレッジ 100% 要件でも扱いが面倒 |
| C | `NEXT_PUBLIC_*` env フラグ | 不採用。env 運用が増え「一旦 OFF」に対して重い |

### 4.2 変更 1: `src/app/[locale]/page.tsx`

- L11 の `import HomeIntro from "@/components/home/HomeIntro";` を削除
- L77 `<HomeIntro>` → `<>`、L116 `</HomeIntro>` → `</>`

他のセクションの順序・構成には一切手を入れない。

### 4.3 変更 2: `src/components/PreHydrationScripts.tsx`

`shouldPlayIntro` prop (既定 `false`) を追加し、`true` のときだけ `introScript` を出力する。

```tsx
interface PreHydrationScriptsProps {
  /** ホーム初回訪問時のイントロ演出を再生するか。既定 false = OFF。 */
  shouldPlayIntro?: boolean;
}

export default function PreHydrationScripts({ shouldPlayIntro = false }: PreHydrationScriptsProps) {
  useServerInsertedHTML(() => (
    <>
      <script suppressHydrationWarning>{browserDetectScript}</script>
      {shouldPlayIntro && <script suppressHydrationWarning>{introScript}</script>}
    </>
  ));
  return null;
}
```

`browserDetectScript` (iOS Safari 判定) は**イントロと無関係なので常に出力を維持する**。

`src/app/[locale]/layout.tsx` L137 の `<PreHydrationScripts />` は既定値で OFF になるため**変更不要**。

### 4.4 復活手順 (このドキュメントと PR 説明に明記する)

1. `page.tsx` で `HomeIntro` を import し直し、`<>` を `<HomeIntro>` に戻す
2. `layout.tsx` の `<PreHydrationScripts />` を `<PreHydrationScripts shouldPlayIntro />` にする
3. `page.test.tsx`: 「イントロ演出 (StarfieldWarp の canvas) を描画しない」ケースを削除し、
   `@/components/home/HomeIntro` の `vi.mock` (children をそのまま返す passthrough) を戻す
4. `PreHydrationScripts.test.tsx`: 既定で script 1 本を期待しているケースを、
   `layout.tsx` の新しい既定に合わせて見直す

もしくは該当 PR をまるごと revert する。

## 5. テスト方針 (TDD: Red → Green → Refactor)

先にテストを期待挙動へ書き換えて落とし (Red)、それから実装を変更する (Green)。

| ファイル | 変更内容 |
|---|---|
| `src/components/PreHydrationScripts.test.tsx` | 既存の「both scripts を出力する」ケースを 2 つに分割する: 既定は `browserDetectScript` のみ (script 1 本)、`shouldPlayIntro` 指定時は 2 本。`introScript` の文字列を検証する 3 ケース (iOS Safari 判定・reduced-motion/session ゲート・6 秒フェイルセーフ) は export が残るためそのまま |
| `src/app/[locale]/page.test.tsx` | `@/components/home/HomeIntro` の `vi.mock` を削除。イントロ由来のラッパーを前提にしたアサーションがあれば併せて除去 |
| `src/components/home/HomeIntro.test.tsx` | 変更なし (コンポーネントを残すため) |
| `src/components/intro/StarfieldWarpIntro.test.tsx` | 変更なし |

`shouldPlayIntro` の両分岐をテストするため、カバレッジ 100% は維持できる。

## 6. リスクと対応

| リスク | 影響 | 対応 |
|---|---|---|
| `page.tsx` だけ直して `introScript` を残す | `intro-pending` が付いたまま 6 秒間 `main` が隠れ、真っ黒画面になる | 2 か所を必ず同一 PR で変更する。ローカルで `sessionStorage` を消した状態の初回表示を確認する |
| イントロ撤去でホームの見え方が変わる | 初回訪問がいきなりヒーローから始まる | 意図した変更。LCP はむしろ改善方向 |
| 復活時に `sessionStorage` の `bigban-intro-played` が残っている | 復活直後のセッションではイントロが出ない | セッション単位なのでブラウザを閉じればリセットされる。軽微として許容 |
| 他作業の未コミット変更 (53 ファイル) の混入 | レビュー困難・意図しない本番反映 | `develop` から新ブランチを切り、この変更だけを載せる |

## 7. 完了条件

- `npx tsc --noEmit` / `npm run lint` / `npm run test:coverage` (100%) / `npm run build` がすべて green
- ローカルで `sessionStorage` をクリアした状態で `/` と `/en` を開き、黒画面もフラッシュも出ずにヒーローが即表示される
- `prefers-reduced-motion: reduce` でも同じく即表示される
- 差分がイントロ配線とそのテストのみに収まっている
- **オーナーの動作確認が済むまでコミットしない**
