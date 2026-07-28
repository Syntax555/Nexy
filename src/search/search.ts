export interface SearchRecord<T> {
  readonly item: T;
  readonly index: number;
  readonly text: string;
  readonly tokens: readonly string[];
}

interface SearchIndexCacheEntry {
  readonly items: readonly unknown[];
  readonly index: readonly SearchRecord<unknown>[];
}

const searchIndexCache = new WeakMap<object, Map<Function, SearchIndexCacheEntry>>();

export function normalizeSearchText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function editDistanceWithin(left: string, right: string, maximum: number): number {
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  if (left === right) return 0;

  const outsideBand = maximum + 1;
  let previous = Array.from(
    { length: right.length + 1 },
    (_, index) => index <= maximum ? index : outsideBand
  );

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = Array.from(
      { length: right.length + 1 },
      () => outsideBand
    );
    if (leftIndex <= maximum) current[0] = leftIndex;
    let rowBest = current[0] ?? outsideBand;
    const start = Math.max(1, leftIndex - maximum);
    const end = Math.min(right.length, leftIndex + maximum);

    for (let rightIndex = start; rightIndex <= end; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        (previous[rightIndex] ?? outsideBand) + 1,
        (current[rightIndex - 1] ?? outsideBand) + 1,
        (previous[rightIndex - 1] ?? outsideBand) + cost
      );
      current[rightIndex] = value;
      rowBest = Math.min(rowBest, value);
    }

    if (rowBest > maximum) return outsideBand;
    previous = current;
  }

  return previous[right.length] ?? outsideBand;
}

function subsequenceScore(query: string, target: string): number {
  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (let targetIndex = 0; targetIndex < target.length && queryIndex < query.length; targetIndex += 1) {
    if (query[queryIndex] !== target[targetIndex]) continue;
    if (firstMatch === -1) firstMatch = targetIndex;
    lastMatch = targetIndex;
    queryIndex += 1;
  }

  if (queryIndex !== query.length) return 0;

  const spreadPenalty = Math.max(0, lastMatch - firstMatch - query.length + 1);
  return Math.max(12, 45 - spreadPenalty - firstMatch);
}

function literalTokenScore(query: string, target: string): number {
  if (query === target) return 120;
  if (target.startsWith(query)) return 96 - Math.min(18, target.length - query.length);
  if (target.includes(query)) return 78 - Math.min(18, target.indexOf(query));
  return 0;
}

function fuzzyTokenScore(query: string, target: string): number {
  const typoLimit = query.length >= 6 ? 2 : 1;
  if (Math.abs(query.length - target.length) <= typoLimit) {
    const distance = editDistanceWithin(query, target, typoLimit);
    if (distance <= typoLimit) return 60 - distance * 12;
  }

  return subsequenceScore(query, target);
}

function scoreRecord<T>(record: SearchRecord<T>, normalizedQuery: string): number {
  if (record.text.includes(normalizedQuery)) return 1000 + normalizedQuery.length;

  const queryTokens = normalizedQuery.split(/\s+/);
  let score = 0;

  for (const queryToken of queryTokens) {
    let best = 0;
    for (const targetToken of record.tokens) {
      best = Math.max(best, literalTokenScore(queryToken, targetToken));
      if (best === 120) break;
    }

    // Very short fuzzy queries generate broad, noisy result sets and are the
    // most expensive case on large rosters. Literal matching is more useful
    // until the user has supplied enough information.
    if (best === 0 && queryToken.length >= 3) {
      for (const targetToken of record.tokens) {
        best = Math.max(best, fuzzyTokenScore(queryToken, targetToken));
      }
    }

    if (best === 0) return 0;
    score += best;
  }

  return score;
}

export function createSearchIndex<T>(
  items: readonly T[],
  textForItem: (item: T) => string
): readonly SearchRecord<T>[] {
  return items.map((item, index) => {
    const text = normalizeSearchText(textForItem(item));
    return {
      item,
      index,
      text,
      tokens: text ? [...new Set(text.split(/\s+/))] : []
    };
  });
}

/**
 * Shares an immutable roster's normalized index between picker instances.
 *
 * The outer WeakMap is keyed by the roster array, so old data can be garbage
 * collected. A shallow snapshot prevents reuse if a caller changes the
 * supposedly-readonly array in place.
 */
export function getCachedSearchIndex<T>(
  items: readonly T[],
  textForItem: (item: T) => string
): readonly SearchRecord<T>[] {
  const owner = items as object;
  let byExtractor = searchIndexCache.get(owner);
  if (!byExtractor) {
    byExtractor = new Map();
    searchIndexCache.set(owner, byExtractor);
  }

  const cached = byExtractor.get(textForItem);
  const unchanged = cached
    && cached.items.length === items.length
    && cached.items.every((item, index) => item === items[index]);
  if (cached && unchanged) {
    return cached.index as readonly SearchRecord<T>[];
  }

  const index = createSearchIndex(items, textForItem);
  byExtractor.set(textForItem, {
    items: [...items],
    index: index as readonly SearchRecord<unknown>[]
  });
  return index;
}

export function searchIndex<T>(
  index: readonly SearchRecord<T>[],
  query: string
): readonly T[] {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return index.map((record) => record.item);

  return index
    .map((record) => ({ record, score: scoreRecord(record, normalizedQuery) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.record.index - right.record.index)
    .map(({ record }) => record.item);
}
