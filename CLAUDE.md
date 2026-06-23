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
