# coverage 除外と代替保証の対応表

> vitest.config.ts の coverage.exclude と 1:1 で対応する。機械可読版は growth-coverage-alternatives.json。

| 除外 path | 代替保証 | 種別 | 残存リスク |
|---|---|---|---|
| `__mocks__/**` | `src/lib/microcms/queries.test.ts`<br>`src/components/home/HomeFacility.test.tsx` | integration-test | 実環境固有の結線はCI外 |
| `src/lib/analytics/trackEvent.ts` | `src/lib/analytics/events.test.ts`<br>`src/components/analytics/TrackedLink.test.tsx` | integration-test | 実環境固有の結線はCI外 |
| `scripts/growth/upload-media.ts` | `scripts/growth/media.test.ts` | alternative-test | 実環境固有の結線はCI外 |
| `scripts/growth/gen-eyecatch.ts` | `scripts/growth/eyecatch.test.ts` | alternative-test | 実環境固有の結線はCI外 |
| `scripts/growth/gen-body-image.ts` | `scripts/growth/body-image.test.ts` | alternative-test | 実環境固有の結線はCI外 |
