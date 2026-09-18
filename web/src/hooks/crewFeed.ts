/**
 * Shared sizing and ordering for the crew's newest-first feeds (trades, orders) and the news list.
 *
 * The rows arrive on the stream inside the crew's own `portfolio` payload — the server filters by
 * the session's crew, so there is nothing to filter here beyond the row count the screen asked for.
 */

/** Default number of rows for Activity and order feeds. */
export const DEFAULT_FEED_LIMIT = 100;

/**
 * Dispatches rendered on News before "See older" (MOBILE §7.11). A dispatch card is ~240px, so the 100 the feed
 * can hold is a 24,000px scroll; ten is about one and a half screens. Nothing is dropped — the rest is one tap
 * away, ten at a time, back to the first dispatch of the game.
 */
export const NEWS_PAGE_SIZE = 10;

export function feedLimit(n: number | undefined): number {
  return n !== undefined && Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_FEED_LIMIT;
}

/** Newest first by `timeField`, ties broken by id, cut to `max`. */
export function newestFirst<T extends { id: string }>(items: readonly T[], timeField: string, max: number): T[] {
  const time = (item: T) => {
    const v = (item as unknown as Record<string, unknown>)[timeField];
    return typeof v === 'number' ? v : 0;
  };
  return [...items].sort((a, b) => time(b) - time(a) || b.id.localeCompare(a.id)).slice(0, max);
}
