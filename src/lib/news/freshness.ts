const MS_PER_DAY = 24 * 60 * 60 * 1000;

interface DatedNews {
  publishedAt?: string;
  createdAt: string;
}

/** 1本でも公開から freshDays 日以内(未来日付を含む)なら true。 */
export function hasFreshNews(
  items: readonly DatedNews[],
  now: Date,
  freshDays: number,
): boolean {
  const threshold = now.getTime() - freshDays * MS_PER_DAY;
  return items.some(
    (item) => new Date(item.publishedAt ?? item.createdAt).getTime() >= threshold,
  );
}
