# ホーム初回イントロ (StarfieldWarp) を一旦 OFF にする 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ホーム (`/`・`/en`) 初回訪問時に約 5.5 秒再生される全画面イントロを、コンポーネントを残したまま配線だけ外して表示しない状態にする。

**Architecture:** イントロは (1) `page.tsx` の `<HomeIntro>` 囲み と (2) `PreHydrationScripts` が出力する `introScript` の 2 か所で有効化されている。両方を外す。`HomeIntro` / `StarfieldWarpIntro` / 定数 / CSS / それらのテストは削除せず残し、`PreHydrationScripts` に `shouldPlayIntro`(既定 `false`) を設けて復活口を残す。

**Tech Stack:** Next.js 16 App Router / TypeScript (strict) / Tailwind CSS v4 / Framer Motion / Vitest + React Testing Library

**設計書:** `docs/superpowers/specs/2026-09-16-home-intro-disable-design.md`

## Global Constraints

- 作業ブランチは `origin/develop` から切る。現在のメインの作業ツリー (`feat/analytics-article-metrics`) には他作業の未コミット変更が 53 ファイルあり、変更対象ファイルもそこに含まれるため、**ブランチ切り替えではなく git worktree を使う**。
- **ローカルコミットは各タスクで行う。push と PR はオーナーの動作確認が完了してから** (Task 5)。
  未検証のコードを外に出さないことが目的なので、worktree 内のローカルコミットは許可する
  (2026-09-16 オーナー裁定。当初は「動作確認までコミット禁止」だったが、
  タスク単位のレビューがコミット範囲の差分を前提とするため変更)。
- 変更してよいファイルは次の 4 つだけ: `src/app/[locale]/page.tsx` / `src/app/[locale]/page.test.tsx` / `src/components/PreHydrationScripts.tsx` / `src/components/PreHydrationScripts.test.tsx`。加えて設計書・本計画の 2 ドキュメント。
- `src/components/home/HomeIntro.tsx` / `src/components/intro/StarfieldWarpIntro.tsx` / `src/constants/intro.ts` / `src/app/globals.css` / それらのテストは**削除も変更もしない**。
- `src/app/[locale]/layout.tsx` は変更しない (`<PreHydrationScripts />` が既定値で OFF になるため)。
- ホームのセクション順序・構成には手を入れない。
- テストカバレッジは 100% (statements / branches / functions / lines) を維持する。CI は `npx tsc --noEmit` → `npm run lint` → `npm run test:coverage` → `npm run build` の順に実行される。
- TDD (Red → Green) を守る。テストを先に書き、失敗を確認してから実装する。
- push は AI 専用アカウント `ttmakhr1028ai-art` で行う (CLAUDE.md の Push Account 規約)。

---

### Task 1: 作業ツリーとブランチを用意する

**Files:**
- Create: `.claude/worktrees/disable-home-intro/` (git worktree。`.claude/*` は .gitignore 済みなのでメイン作業ツリーを汚さない)
- Copy: `docs/superpowers/specs/2026-09-16-home-intro-disable-design.md`、`docs/superpowers/plans/2026-09-16-home-intro-disable.md`

**Interfaces:**
- Consumes: なし
- Produces: 以降の全タスクが実行される作業ディレクトリ `.claude/worktrees/disable-home-intro`（ブランチ `fix/disable-home-intro`、`origin/develop` 起点）

- [ ] **Step 1: develop の最新を取得する**

```bash
cd /Users/tsutsumi.akihiro/dev/bigban
git fetch origin develop
```

- [ ] **Step 2: worktree を作る**

```bash
git worktree add -b fix/disable-home-intro .claude/worktrees/disable-home-intro origin/develop
```

- [ ] **Step 3: 起点が正しいか確認する**

```bash
git -C .claude/worktrees/disable-home-intro log --oneline -1
git -C .claude/worktrees/disable-home-intro status --porcelain
```

期待: `origin/develop` の先頭コミットが表示され、`status --porcelain` は空 (クリーン)。

- [ ] **Step 4: 依存をインストールする**

worktree は `node_modules` を共有しないため個別に入れる。

```bash
cd /Users/tsutsumi.akihiro/dev/bigban/.claude/worktrees/disable-home-intro
npm ci
```

- [ ] **Step 5: ベースラインが green か確認する**

```bash
npm run test:coverage
```

期待: PASS、カバレッジ 100%。ここで落ちる場合は develop 側の問題なので、先にオーナーへ報告して判断を仰ぐ。

- [ ] **Step 6: 設計書と本計画を worktree にコピーする**

メイン作業ツリーでは未追跡のまま置かれているため、コミット対象としてこちらへ持ち込む。

```bash
cd /Users/tsutsumi.akihiro/dev/bigban/.claude/worktrees/disable-home-intro
mkdir -p docs/superpowers/plans
cp /Users/tsutsumi.akihiro/dev/bigban/docs/superpowers/specs/2026-09-16-home-intro-disable-design.md docs/superpowers/specs/
cp /Users/tsutsumi.akihiro/dev/bigban/docs/superpowers/plans/2026-09-16-home-intro-disable.md docs/superpowers/plans/
```

**以降の Task 2〜5 は、すべて `.claude/worktrees/disable-home-intro` をカレントディレクトリとして実行する。**

---

### Task 2: PreHydrationScripts のイントロスクリプトを既定 OFF にする

先にこちらを行う。仮にこの状態で止まっても「イントロ前にヒーローが一瞬見える」程度で済む。逆順 (先に `page.tsx`) だと `intro-pending` が付いたまま誰も外さず 6 秒間の真っ黒画面になる。

**Files:**
- Modify: `src/components/PreHydrationScripts.tsx`
- Test: `src/components/PreHydrationScripts.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces: `PreHydrationScripts` が `shouldPlayIntro?: boolean` (既定 `false`) を受け取る。`true` のときだけ `introScript` を出力する。`browserDetectScript` と `introScript` の named export は従来どおり維持する。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/PreHydrationScripts.test.tsx` の
`it("registers a useServerInsertedHTML callback that emits both scripts", ...)` ブロックを、次の 2 ケースへ置き換える。他のケース (`returns null` / `exposes browser detection logic` / `exposes intro-pending logic` / `6 秒フェイルセーフ`) は `introScript` の export が残るため変更しない。

```tsx
  it("既定ではブラウザ判定スクリプトのみを出力する (イントロは OFF)", async () => {
    const { default: PreHydrationScripts, browserDetectScript } = await import(
      "./PreHydrationScripts"
    );

    render(<PreHydrationScripts />);

    const cb = state.callback;
    if (!cb) throw new Error("useServerInsertedHTML callback was not captured");

    const { container } = render(<>{cb()}</>);
    const scripts = container.querySelectorAll("script");
    expect(scripts.length).toBe(1);
    expect(scripts[0].textContent).toBe(browserDetectScript);
  });

  it("shouldPlayIntro を渡したときだけイントロスクリプトも出力する", async () => {
    const { default: PreHydrationScripts, browserDetectScript, introScript } =
      await import("./PreHydrationScripts");

    render(<PreHydrationScripts shouldPlayIntro />);

    const cb = state.callback;
    if (!cb) throw new Error("useServerInsertedHTML callback was not captured");

    const { container } = render(<>{cb()}</>);
    const scripts = container.querySelectorAll("script");
    expect(scripts.length).toBe(2);
    expect(scripts[0].textContent).toBe(browserDetectScript);
    expect(scripts[1].textContent).toBe(introScript);
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
npx vitest run src/components/PreHydrationScripts.test.tsx
```

期待: FAIL。
- 「既定では〜」ケースが `expected 2 to be 1` で落ちる (現状は常に 2 本出力するため)
- 「shouldPlayIntro を渡したとき〜」ケースは TypeScript 的に未知の prop になるため、`npx tsc --noEmit` でも `Property 'shouldPlayIntro' does not exist` が出る

- [ ] **Step 3: 最小限の実装を書く**

`src/components/PreHydrationScripts.tsx` の末尾を次のとおり変更する。`browserDetectScript` と `introScript` の定義行は触らない。

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

あわせて `introScript` の直前にあるコメントの末尾へ、OFF である旨を 1 行追記する。

```tsx
// 現在ホームのイントロは一旦 OFF (shouldPlayIntro 既定 false) のため、このスクリプトは
// 出力されない。復活させるときは layout.tsx で <PreHydrationScripts shouldPlayIntro /> にする。
```

- [ ] **Step 4: テストを実行して通ることを確認する**

```bash
npx vitest run src/components/PreHydrationScripts.test.tsx
npx tsc --noEmit
```

期待: どちらも PASS / エラーなし。

- [ ] **Step 5: コミットする**

```bash
git add src/components/PreHydrationScripts.tsx src/components/PreHydrationScripts.test.tsx
git commit -m "fix: イントロ用スクリプトを既定で出力しないようにする

PreHydrationScripts に shouldPlayIntro (既定 false) を設け、true のときだけ
intro-pending スクリプトを出力する。browserDetectScript は従来どおり常に出力する。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: page.tsx から HomeIntro の囲みを外す

**Files:**
- Modify: `src/app/[locale]/page.tsx` (L11 の import、L77 / L116 の囲み)
- Test: `src/app/[locale]/page.test.tsx`

**Interfaces:**
- Consumes: Task 2 で `PreHydrationScripts` が既定 OFF になっていること
- Produces: `Home` が `<HomeIntro>` を介さずに `<StructuredData>` + `<main>` を直接返す

- [ ] **Step 1: 失敗するテストを書く**

`src/app/[locale]/page.test.tsx` の冒頭にある `HomeIntro` の mock を削除する。

```tsx
// 削除する
vi.mock("@/components/home/HomeIntro", () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
```

そのうえで `describe("Home Page", ...)` の中へ次のケースを追加する。イントロ本体 (`StarfieldWarpIntro`) は `<canvas>` を描画するため、canvas が無いことがイントロ非再生の証明になる。

```tsx
  it("イントロ演出 (StarfieldWarp の canvas) を描画しない", async () => {
    const { default: Home } = await import("./page");
    const element = await Home({ params: Promise.resolve({ locale: "ja" }) });
    const { container } = render(element);

    expect(container.querySelector("canvas")).toBeNull();
  });
```

- [ ] **Step 2: テストを実行して失敗を確認する**

```bash
npx vitest run "src/app/[locale]/page.test.tsx"
```

期待: FAIL。mock を外したことで実物の `HomeIntro` が描画され、`container.querySelector("canvas")` が `<canvas role="img" aria-label="ハイパースペース・ワープ シネマティック演出">` を返すため `expected <canvas /> to be null` になる。

- [ ] **Step 3: 最小限の実装を書く**

`src/app/[locale]/page.tsx` を 3 点だけ変更する。

1. L11 の import を削除する

```tsx
// 削除する
import HomeIntro from "@/components/home/HomeIntro";
```

2. L77 の開きタグを Fragment にする

```tsx
  return (
    <>
      <StructuredData data={buildServices()} />
```

3. L116 の閉じタグを Fragment にする

```tsx
      </main>
    </>
  );
```

セクションの順序・コメントには一切手を入れない。

- [ ] **Step 4: テストを実行して通ることを確認する**

```bash
npx vitest run "src/app/[locale]/page.test.tsx"
```

期待: PASS。既存の順序検証テスト (`HomeHero → HomeLatestNews → HomeFacility → HomeConcept`) も引き続き PASS すること。

- [ ] **Step 5: コミットする**

```bash
git add "src/app/[locale]/page.tsx" "src/app/[locale]/page.test.tsx"
git commit -m "fix: ホーム初回イントロ (StarfieldWarp) の再生を止める

page.tsx の <HomeIntro> 囲みと import を外す。PreHydrationScripts 側の既定 OFF と
必ずセットで有効になる変更で、片方だけだと main が 6 秒間 visibility:hidden のまま残る。

HomeIntro / StarfieldWarpIntro とそれらのテストは、あとで戻せるよう残している。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: CI 相当の全チェックを通す

**Files:**
- Modify: なし (落ちた場合のみ Task 2 / Task 3 の対象ファイルを直す)

**Interfaces:**
- Consumes: Task 2・Task 3 の変更
- Produces: CI と同じ 4 チェックが green である状態

- [ ] **Step 1: 型チェック**

```bash
npx tsc --noEmit
```

期待: エラーなし。

- [ ] **Step 2: Lint**

```bash
npm run lint
```

期待: エラーなし。`HomeIntro` は import されなくなるだけで、ファイル自体は残るため unused 系の指摘は出ない。

- [ ] **Step 3: テスト + カバレッジ 100%**

```bash
npm run test:coverage
```

期待: 全 PASS、statements / branches / functions / lines すべて 100%。`HomeIntro.test.tsx` と `StarfieldWarpIntro.test.tsx` を残しているため、未使用コンポーネントのカバレッジも従来どおり満たされる。

- [ ] **Step 4: プロダクションビルド**

```bash
npm run build
```

期待: 成功。

- [ ] **Step 5: 差分が想定どおりか確認する**

```bash
git status --porcelain
git diff --stat
```

期待: 変更は 4 ファイル (`page.tsx` / `page.test.tsx` / `PreHydrationScripts.tsx` / `PreHydrationScripts.test.tsx`) と、未追跡のドキュメント 2 本のみ。それ以外が出ていたら取り消す。

---

### Task 5: オーナーの動作確認を受けてからコミット・PR

**Files:**
- Modify: なし

**Interfaces:**
- Consumes: Task 4 で green になった作業ツリー
- Produces: `fix/disable-home-intro` ブランチと PR

- [ ] **Step 1: 開発サーバーを立ち上げて確認を依頼する**

```bash
npm run dev
```

オーナーへ次の観点で確認を依頼する (ブラウザ確認はオーナーが行う)。

1. DevTools で `sessionStorage` をクリア (または新しいプライベートウィンドウ) してから `/` を開く → 黒画面・星・フラッシュが出ず、ヒーローが即表示される
2. 同様に `/en` を開く → 同じ挙動
3. ページをリロードしても黒画面が挟まらない
4. ホームのセクション順序・見た目が develop と変わっていない
5. スクロールが最初から効く (`intro-scroll-lock` が残っていない)
6. OS の「視差効果を減らす / アニメーションを減らす」を ON (`prefers-reduced-motion: reduce`) にしても同じく即表示される

- [ ] **Step 2: 承認を待つ**

オーナーの「OK」が出るまでコミットしない。修正要望が出た場合は該当タスクへ戻る。

- [ ] **Step 3: push アカウントを確認する**

```bash
gh auth status
```

期待: アクティブアカウントが `ttmakhr1028ai-art`。違う場合は `gh auth switch --user ttmakhr1028ai-art` で切り替える。切り替えられない場合は STOP してオーナーへ報告する。

- [ ] **Step 4: コミットが揃っているか確認する**

```bash
git log --oneline origin/develop..HEAD
git status --porcelain
```

期待: 3 コミット (docs / PreHydrationScripts / page.tsx) が並び、未コミットの変更はない。

- [ ] **Step 5: push して PR を作る**

```bash
git push -u origin fix/disable-home-intro
gh pr create --base develop --title "fix: ホーム初回イントロ (StarfieldWarp) を一旦OFFにする" --body "$(cat <<'BODY'
## 変更内容

ホーム (`/`・`/en`) 初回訪問時に約 5.5 秒再生される全画面イントロを一旦 OFF にする。

- `src/app/[locale]/page.tsx`: `<HomeIntro>` の囲みと import を削除
- `src/components/PreHydrationScripts.tsx`: `shouldPlayIntro`(既定 `false`) を追加し、既定では `introScript` を出力しない

`HomeIntro` / `StarfieldWarpIntro` / `constants/intro.ts` / intro 系 CSS とそれらのテストは**削除していない**。

## なぜ

一旦イントロを見せない形にしたいため。将来戻す可能性があるのでコードは残す。

片方だけ止めると `intro-pending` が付いたまま誰も剥がさず、`main` が 6 秒間
`visibility:hidden` = 真っ黒画面になるため、2 か所をセットで変更している。

## 戻し方

1. `page.tsx` で `HomeIntro` を import し直し、`<>` を `<HomeIntro>` に戻す
2. `layout.tsx` を `<PreHydrationScripts shouldPlayIntro />` にする
3. 対応するテストを戻す

もしくはこの PR を revert する。

## テスト

- [x] `npx tsc --noEmit`
- [x] `npm run lint`
- [x] `npm run test:coverage` (カバレッジ 100%)
- [x] `npm run build`
- [x] `sessionStorage` クリア後の `/` と `/en` で、黒画面・フラッシュなしにヒーローが即表示されることをオーナーが確認

## 設計書

`docs/superpowers/specs/2026-09-16-home-intro-disable-design.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

- [ ] **Step 6: 後片付けの案内**

マージ後に worktree を畳む (マージはオーナーが判断する)。

```bash
cd /Users/tsutsumi.akihiro/dev/bigban
git worktree remove .claude/worktrees/disable-home-intro
```
