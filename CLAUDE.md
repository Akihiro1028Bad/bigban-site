# THE PICKLE BANG THEORY

Premium Indoor Pickleball Facility Website
Next.js 16 + TypeScript + Tailwind CSS v4 + Framer Motion
Open: 2026-04-18

## Project Structure

```
src/
  app/                    # App Router pages
    layout.tsx            # Root layout (fonts, metadata, global styles)
    page.tsx              # Home
    facility/page.tsx     # Facility
    services/page.tsx     # Services
    teaser/page.tsx       # Teaser (standalone)
    [locale]/news/        # ニュース一覧 + 詳細 (microCMS 連携)
    api/revalidate/       # microCMS Webhook (HMAC 検証 + revalidateTag)
    api/draft/{enable,disable}/  # プレビューモード制御
  components/             # Shared & page-specific components
    Navigation.tsx
    Footer.tsx
    facility/             # Facility page components
    services/             # Services page components
    news/                 # ニュース UI (NewsCard, NewsBodyRenderer 等)
  config/featureFlags.ts  # USE_CMS_NEWS 等のフラグ
  constants/news.ts       # ニュースカテゴリ・ページサイズ定数
  lib/microcms/           # microCMS クライアント・スキーマ・クエリ
  lib/news/               # サニタイズ・抜粋ユーティリティ
public/
  logos/                  # Brand assets (SVG, PNG)
```

## ニュース CMS (microCMS)

- 設計書: `docs/superpowers/specs/2026-04-19-news-cms-integration-design.md`
- 実装計画: `docs/superpowers/plans/2026-04-19-news-cms-integration.md`
- 運用マニュアル: `docs/operations/news-admin-manual.md`
- AI 生成プロンプト: `docs/operations/ai-news-prompt.md`
- Feature Flag: `USE_CMS_NEWS=true` で有効化、未設定/false で旧ハードコード表示
- 環境変数は `.env.example` の `MICROCMS_*` セクションを参照
- Webhook URL (microCMS 管理画面で設定): `${SITE_URL}/api/revalidate`
- プレビュー URL: `${SITE_URL}/api/draft/enable?secret=...&slug=...&draftKey=...&locale=ja|en`

## グロースループ記事生成 (headless)

- 文体・構成の正典: `docs/operations/growth-article-style.md`、運用手順: `docs/operations/growth-weekly-runbook.md`
- 記事の前提（施設の現況=開業前/開業済み・確定事実・書いてはいけない未確定項目）は **`scripts/growth/facility-context.json` を唯一の単一ソース**とする。`npm run growth:facility-context` で出力し、下書きモード冒頭で正典として注入（style-guide §13）
- 文体ルール: 翻訳調・AIっぽさを避ける（§14）／外部リンク濫用・未検証数値・タイトル盛りを避け内部リンクを検討（§15）
- 実行は自宅 PC の headless `claude -p`（`scripts/growth/run.mjs`）。git push / commit・本番公開はしない
- 構成案の修正ループ（Epic #40 / タイトルAI修正 #139 B）: 承認画面で構成案に行コメント、またはタイトル専用枠に指示→「修正を依頼」→ 常時稼働PCの `revise` モード（5分間隔・`npm run growth:revise-loop`）が `claude` で**指示が来た方だけ**（構成案／タイトル）を修正→提示中→ユーザーが**元 vs 新**を見比べてまとめて反映（提案がある方だけ適用）。Notion「記事ネタ案」に6プロパティ（`修正指示`/`修正ステータス`/`修正案`/`修正依頼時刻`、#139 B で `修正タイトル指示`/`修正タイトル案`）の事前追加が必要（後者2つが無くても構成案修正は動く）。タイトルは title型 `タイトル案` を上書き。純ロジックは `scripts/growth/revise.ts`、PC配線は `revise-cli.ts`（`present <pageId>` が `.growth-tmp/revise-proposal.txt`／`revise-title.txt` の存在する方を提示）。運用は `docs/operations/growth-weekly-runbook.md` の「構成案の修正ループ」節を参照
- 本文画像（Epic #59）: 承認画面で構成案のセクションに画像指示（スタイル `mascot`/`minimal`/`diagram` ＋説明）を追加→下書き生成時に `growth:publish-draft` が生成→microCMSへupload→本文の `{{IMG:n}}` を `<figure>` へ置換。実写禁止・`diagram` は「イメージ図」明示・1記事上限3枚。正典は style-guide §9「本文画像」、純ロジックは `scripts/growth/body-image.ts`
- 下書きプレビュー＋手動リッチ編集（Epic #72）: 承認画面の記事詳細パネルで microCMS 下書きを実プレビュー（`NewsBodyRenderer` 再利用）し、TipTap リッチエディタで本文を直して保存（`/api/growth/draft/edit`→`patchDraft` で下書き上書き・公開しない）。手動編集は Vercel から microCMS を直接読み書き（AI修正ループとは別系統）。Notion「記事ネタ案」に `下書きID`/`下書きプレビューキー` の事前追加＋Vercel に `MICROCMS_CONTENT_API_KEY` が必要。メディアは保持のみ（新規作成は次Epic）。`DraftEditor.tsx` はカバレッジ除外、純ロジックは `draftEditorContent.ts`。運用は runbook の「承認画面で下書きをプレビュー＋手動リッチ編集」節を参照
- 下書き画像（アイキャッチ＋本文画像）の表示・差し替え・再生成（Epic #140）: 表示=#141（Notionミラー）。基盤=#142 メディア一覧/アップロード API（`/api/growth/media` GET=一覧・POST=アップロード、microCMS **MANAGEMENT API**・`{domain}.microcms-management.io/api/v1/media`）。純ロジック＝`src/lib/growth/media.ts`（list/upload のみ・delete は作らない・サイズ5MB/MIMEホワイトリスト検証・`sanitizeFileName`・`isMicrocmsAssetUrl`）。差し替え=#143（`EyecatchPicker.tsx` でメディア選択/アップロード→`/api/growth/draft/eyecatch` が **CONTENTキー**で `patchDraft({eyecatch})`＋Notionミラー `アイキャッチURL` 更新→プレビュー再取得。`eyecatchUrl` は `images.microcms-assets.io` 厳密一致）。AI再生成=#144（pull型・修正ループ#40と同方式。`EyecatchPicker` の「AIで再生成」→`/api/growth/eyecatch/regen` が Notion に依頼記録→PCの `npm run growth:regen-loop`（run.mjs regen）が `gen-eyecatch`→`upload-media`→`growth:eyecatch-regen done` で差し替え＋LINE通知。純ロジック=`scripts/growth/eyecatch-regen.ts`、CLI/run.mjs はカバレッジ除外。Notion 3プロパティ `アイキャッチ再生成指示/...ステータス/...依頼時刻` の事前追加が必要・欠落耐性）。本文画像差し替え=#145（`BodyImagePicker.tsx` がプレビューの本文画像を一覧→メディア選択/アップロード→`bodyImageEdit.ts` で該当 `<img src>` を差し替え→`/api/growth/draft/edit` で保存。純ロジック `bodyImageEdit.ts`）。本文画像のAI再生成=#156（pull型・#144と同方式。`BodyImagePicker` の各画像「AIで再生成」→`/api/growth/body-image/regen` が Notion に依頼記録（**対象src**＝その時点の画像URLで「どの画像か」を持つ・インデックスは使わない）→PCの `npm run growth:regen-body-loop`（run.mjs regen-body）が `gen-body-image`→`upload-media`→`growth:body-image-regen done <pageId> <targetSrc> <url>` で本文HTMLの当該 `<img>` を `replaceBodyImageBySrc` で差し替え＋CONTENTキーで `patchDraft({bodyHtml})`＋Notionミラー（本文HTML #95）更新＋LINE通知。依頼後に本文が変わり対象srcが消えたら失敗通知＝沈黙させない。純ロジック=`scripts/growth/body-image-regen.ts`（`replaceBodyImageBySrc`/`isMicrocmsAssetUrl` 含む）、CLI/`gen-body-image`/run.mjs はカバレッジ除外。Notion 4プロパティ `本文画像再生成指示/...ステータス/...依頼時刻/...対象` の事前追加が必要・欠落耐性）。**`MICROCMS_MANAGEMENT_API_KEY` は server-only**（`NEXT_PUBLIC_` 禁止・クライアントへ渡さない）。⚠️ **本番公開前に `APPROVE_AUTH_ENABLED` を必ず ON にする**（強権限 API のため。gate は実装済み・開発段階はオフ）。横断的なセキュリティハードニング（safeEqual・featureFlags分離・依存CVE等）は #7 に集約
- 記事スタイリング・アドバイザー（#146・read-only・pull型）: 承認画面の下書きプレビューに「スタイリング・アドバイス」カード（`AdviceCard.tsx`）。「アドバイスを依頼」→`/api/growth/advise` が Notion に依頼記録（依頼中）→PCの `npm run growth:advise-loop`（run.mjs advise）が `claude` で本文（Notionミラー `下書き本文HTML` #95 を読む・本文は送らない）を style-guide §11/§14/§15/§4/§12/§9 に照らして分析→`growth:advise present <pageId> <jsonファイル>` が**アドバイスJSONを zod 検証**して Notion `アドバイス結果` に書き（提示中）＋LINE通知。承認画面は `/api/growth/draft` GET（`adviceViewOf` で advice も返す）で取得し AdviceCard に総評／観点別スコア／強み／直すべき点（引用＋理由＋修正案）を表示。「閉じる」=`/api/growth/advise/dismiss`（なしに戻す）。**read-only**＝本文・下書き・microCMS には一切書き込まない（書き込み先は Notion のみ・強権キー不要）。純ロジック=`scripts/growth/advise.ts`（`AdviceSchema`/`parseAdvice`(安全側 null)/`serializeAdvice`/`adviceViewOf`/`adviceRowFromPage` 等・`src/lib/growth/advise.ts` 再エクスポート）、CLI/run.mjs はカバレッジ除外。Notion 4プロパティ `アドバイス指示/...ステータス/...結果/...依頼時刻` の事前追加が必要・欠落耐性。#128 `draftQuality.ts`（機械的○×）の**補完**（理由・改善案レイヤー）であり置換ではない。見た目の“具体操作（採用→本文反映）”は装飾アシスタント #147 に分離
- 記事装飾アシスタント（#147・採用→本文反映・pull型）: 承認画面の下書きプレビューに「装飾アシスタント」カード（`DecorationAssistant.tsx`）。「装飾を提案」→`/api/growth/decorate` が Notion に依頼記録→PCの `npm run growth:decorate-loop`（run.mjs decorate）が `claude` で本文（Notionミラー #95）をトップレベル要素ごとに見て【箇所ごとの装飾提案】（op=add/change/remove × decoration=note/caution/highlight/blockquote）を作り `growth:decorate present <pageId> <json>` が **zod 検証**して Notion `装飾提案` に書く（提示中）。人が提案を採用/却下→「採用分を反映」で**決定的な `applyDecoration`**（許可リスト内の固定変換）で本文へ反映→既存 `/api/growth/draft/edit`（CONTENTキー・STRICT再サニタイズ）で保存。**安全の要＝AIに生HTMLを出させない**（提案はメタのみ・HTMLはシステムが生成）。アンカーはブロックindex＋抜粋照合（不一致は「要確認」で弾く・誤適用防止）。純ロジック=`scripts/growth/decorate.ts`（`splitTopLevelBlocks`/`applyDecoration`/`applyDecorations`/`previewDecoration`/`DecorationProposalSchema`/`parseProposals`(安全側[])/`decorateViewOf` 等・`src/lib/growth/decorate.ts` 再エクスポート）、CLI/run.mjs はカバレッジ除外。Notion 4プロパティ `装飾指示/...ステータス/...提案/...依頼時刻` の事前追加が必要・欠落耐性。list/table/cta は初手対象外（随伴バックログ）。これで文体#146＋装飾#147 の2本が完了
- 計測ループ（#C4・成績ボード・pull型）: 公開記事の GA4 成績（表示数/ユーザー数＋前週比）を承認画面の「成績ボード」（`PerformanceBoard.tsx`）に表示。プル型＝PCの `npm run growth:metrics`（`metrics-cli.ts`）が GA4 `topPages`（pagePath→screenPageViews/activeUsers・current/prior 2期間）を取得→Notion 公開記事（ステータス=公開済み）ごとに microCMS を contentId で引いて `slug`/`locale`→`articlePagePath` で GA4 pagePath を組み立て→`metricsForPagePath`（クエリ違いの行は合算）で突き合わせ→`成績データ`(JSON)＋`成績更新時刻`(date) を Notion へ書く。承認画面は `toPendingItems` が `成績データ` を `parseMetrics`（zod・安全側 null）して `PendingItem.metrics` に載せ、`PerformanceBoard` が合計＋表示数降順リストを描画。**承認画面は Notion を読むだけ**（GA4/microCMS は触らない）。純ロジック=`scripts/growth/metrics.ts`（`articlePagePath`/`normalizePagePath`/`metricsForPagePath`/`serializeMetrics`/`parseMetrics`/`buildMetricsMirrorProps`/`summarizeMetrics`・`src/lib/growth/metrics.ts` 再エクスポート）＋表示整形 `articleMetricsView.ts`（`formatCount`/`formatDelta`）、CLI はカバレッジ除外。Notion 記事ネタ案DB に2プロパティ `成績データ`(テキスト)/`成績更新時刻`(日付) の事前追加が必要・欠落耐性。`growth:metrics` は cron 等で定期実行（claude 不使用の純データ結線・`GROWTH_DRYRUN=1` で空実行）
- 公開キュー（#H23 例外管理型＋#H24 予約公開）: 記事タブ上部の折りたたみ「公開キュー」（`PublishQueue.tsx`）で、下書き済み記事を **公開OK(green)** と **要対応(例外・理由付き)** に振り分け、green を **一括公開**／**一括予約**できる。公開可否＝アイキャッチ有り＋本文非空（`partitionPublishQueue`／`publishBlockReason`）。公開は既存 `/api/growth/publish`（冪等）を ready 件数ぶん順次呼ぶ。**予約公開はプル型**: microCMS は書き込み API で予約公開を持たない（`reservationTime` は管理画面専用・read-only／status PATCH は `["PUBLISH"|"DRAFT"]` のみ）ため、`/api/growth/publish/schedule` が Notion `公開予約時刻` に時刻を書くだけ（強権キー不要）。実際の公開は PCの `npm run growth:publish-due`（`publish-due-cli.ts`）が `selectDuePublications` で到来分を選び `publishContent`（管理キー）で公開＋予約解除＋LINE通知。承認画面は Notion を読むだけ（`toPendingItems` が `eyecatchUrl`/`hasDraftBody`/`scheduledAtMs` を載せる）。純ロジック=`scripts/growth/publishQueue.ts`（`publishBlockReason`/`partitionPublishQueue`/`selectDuePublications`/`buildScheduleProps`/`PUBLISH_SCHEDULE_PROP`・`src/lib/growth/publishQueue.ts` 再エクスポート）＋表示整形 `articleMetricsView.ts`（`formatScheduledAt`）、CLI はカバレッジ除外。Notion 記事ネタ案DB に `公開予約時刻`(日付) の事前追加が必要・欠落耐性。生成中/公開済みは段階ガード(#H9)で予約も弾く

## Development Process — TDD

Red -> Green -> Refactor cycle is mandatory for all development.

1. **Red:** Write a failing test first that defines the expected behavior
2. **Green:** Write the minimum implementation to make the test pass
3. **Refactor:** Clean up the code while keeping tests green

Rules:
- New features and bug fixes must start with a test. Never write implementation code first
- Components: write rendering and interaction tests before implementation
- Hooks: write return value and side-effect tests before implementation
- Utilities: write input/output tests before implementation
- PR review must verify tests were written before implementation via commit history

## Coding Standards — TypeScript

- `strict: true` is mandatory. No exceptions
- `any` is forbidden. Use `unknown` + type narrowing
- `React.FC` is forbidden. Use plain function declarations with `ComponentNameProps` interface
- Always use `import type` for type-only imports
- Boolean props use `is` / `has` / `should` / `can` prefix
- Event handler props use `on` prefix, handler functions use `handle` prefix
- No `@ts-ignore`. Use `@ts-expect-error` with explanation as last resort

## Coding Standards — File Naming

- Components: `PascalCase.tsx` (one component per file)
- Hooks: `useXxx.ts`
- Utilities: `camelCase.ts`
- Types (standalone): `camelCase.ts` or `types.ts` within feature folder
- Tests: `ComponentName.test.tsx` (co-located with source file)
- Constants: `camelCase.ts`

## Coding Standards — Import Order

1. React
2. Third-party libraries
3. Internal `@/` aliases
4. Relative parent imports
5. Relative sibling imports
6. `import type`
7. Styles / assets

Blank line between each group. No circular imports.

## Next.js App Router

- Default to Server Components. Add `"use client"` only for interactivity, hooks, or browser APIs
- Push client boundaries to the leaves (smallest possible scope)
- Always use `next/image`, `next/font`, `next/script` — never raw HTML equivalents
- Place `loading.tsx` in every route segment that fetches data
- Place `error.tsx` at meaningful segment boundaries for error recovery
- Define metadata via the metadata API in `layout.tsx` / `page.tsx`
- Use `generateMetadata` for dynamic pages
- Use route groups `(name)` to organize without affecting URLs
- Pass Server Components as `children` to Client Components for interleaving
- All props crossing server-client boundary must be serializable

## Tailwind CSS v4

- Use `@import "tailwindcss"` + `@theme` directive for configuration (no JS config)
- Define design tokens in `@theme` with namespaced custom properties: `--color-*`, `--font-*`, `--breakpoint-*`
- Prefer utility class composition over CSS component abstractions
- Page layout: viewport breakpoints (`sm:`, `md:`, `lg:`)
- Component layout: container queries (`@sm:`, `@md:`)
- Dark mode: define with `@custom-variant dark`
- All `@theme` tokens are available as CSS custom properties at runtime

## Framer Motion

- Any file using `motion.*`, `AnimatePresence`, `useScroll`, `useTransform`, `useInView` must have `"use client"`
- Animate transform properties (`x`, `y`, `scale`, `rotate`, `opacity`) — avoid animating `width`, `height`, `top`, `left`
- Scroll-linked animations: `useScroll` + `useTransform` chain. Never use manual scroll event listeners
- Scroll-triggered reveals: `whileInView` + `once: true` as the default pattern
- Page transitions: `AnimatePresence` + `mode="wait"`
- Use `useMotionValue` for values that update outside React's render cycle
- Use variants + `staggerChildren` for orchestrated section reveals

## Accessibility

- Semantic HTML first. `div` + `onClick` is forbidden — use `button` or `a`
- All images must have `alt` attribute. Decorative images: `alt=""`
- All form inputs must have an associated `label`
- Keyboard navigation: every interactive element must be reachable and operable via keyboard
- Respect `prefers-reduced-motion` for all animations
- Color contrast: WCAG 2.1 AA compliance (4.5:1 minimum for normal text, 3:1 for large text)
- ARIA: use sparingly, prefer native HTML semantics
- Run axe-core audits on all pages in E2E tests

## Testing Strategy

### Coverage

- **Target: 100% coverage on all files** (statements, branches, functions, lines)
- CI enforces coverage threshold — builds fail below 100%
- No new code may be merged without tests

### Unit / Integration Tests

- **Tools:** Vitest + React Testing Library
- Test behavior, not implementation
- Query by accessible role/label: `getByRole`, `getByLabelText` (prefer over `getByTestId`)
- API mocking: MSW (Mock Service Worker) — never mock fetch/axios directly
- Custom hooks: test via `renderHook` from `@testing-library/react`
- No snapshot tests for components (brittle, low value)

### E2E Tests

- **Tool:** Playwright
- **Browsers:** Chromium + Firefox + WebKit (3-engine coverage)
- **Scope:** Critical user journeys only:
  - Page navigation and transitions
  - Form submissions (email signup, etc.)
  - Responsive display (desktop 1440px, tablet 768px, mobile 375px)
  - Animation triggers (element visibility/state changes)
  - Accessibility audit (axe-core on every page)
- **Architecture:** Page Object Model pattern for page interaction abstraction
- **Data:** No external dependencies. Use MSW for API mocking, fixtures for test data
- **Execution:** Parallel runs + 1 retry for flaky test mitigation
- **Visual regression:** Screenshot comparison on key pages
- **CI:** Run on every PR against preview build

## Performance

- Core Web Vitals targets: LCP < 2.5s, INP < 200ms, CLS < 0.1
- JS bundle: initial load under 200KB gzip
- `React.memo` / `useMemo` / `useCallback` only after profiling confirms need
- Code split at route boundaries with `React.lazy` + `Suspense`
- Images: `next/image` with lazy loading by default, `priority` for above-fold LCP images
- Fonts: `next/font` for zero-layout-shift self-hosted fonts
- Lighthouse CI in pipeline with performance budgets

## Git Conventions

### Push Account (MANDATORY)

- **Always push using the dedicated AI account `ttmakhr1028ai-art`.** Never push with a human/owner account.
- Before any `git push` (or `gh` write operation that pushes), verify the active account:
  - `gh auth status` → active account must be `ttmakhr1028ai-art`.
  - If not, switch first: `gh auth switch --user ttmakhr1028ai-art`.
- If the AI account is unavailable or lacks access, STOP and report — do not silently fall back to another account.

### Branches

- `feature/short-description`
- `fix/short-description`
- `chore/short-description`
- Short-lived, merge to `main` frequently. Feature flags for incomplete work.

### Commits

Conventional Commits format:
- `feat:` / `fix:` / `refactor:` / `chore:` / `docs:` / `test:` / `perf:`
- Scope optional: `feat(auth): add OAuth2 login`
- Imperative mood: "add feature" not "added feature"
- Body explains *why*, not *what*

### Pull Requests

- Under 400 lines of diff
- Title follows Conventional Commits format
- Description: what changed, why, how to test, screenshots for UI changes
- Requires at least one approval before merge

## Color Palettes

### New Palette (applied to teaser)

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#000000` | Background |
| Deep Blue | `#11317B` | Secondary dark, ambient |
| Bright Blue | `#306EC3` | Neon logo accent, glow |
| Accent | `#F6FF54` | CTA, highlights |
| Light Gray | `#E6E6E6` | Text, light backgrounds |
| Text Gray | `#8A8A8A` | Secondary text |

### Legacy Palette (home, facility, services)

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#0A0A0A` | Background |
| Off-white | `#F5F2EE` | Text, light backgrounds |
| Accent | `#C8FF00` | CTA, highlights |
| Text Gray | `#8A8A8A` | Secondary text |
