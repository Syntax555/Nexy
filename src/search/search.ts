export interface SearchRecord<T> {
  readonly item: T;
  readonly index: number;
  readonly text: string;
  readonly tokens: readonly string[];
}

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

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowBest = current[0] ?? leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        (previous[rightIndex] ?? maximum + 1) + 1,
        (current[rightIndex - 1] ?? maximum + 1) + 1,
        (previous[rightIndex - 1] ?? maximum + 1) + cost
      );
      current[rightIndex] = value;
      rowBest = Math.min(rowBest, value);
    }

    if (rowBest > maximum) return maximum + 1;
    previous = current;
  }

  return previous[right.length] ?? maximum + 1;
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

function tokenScore(query: string, target: string): number {
  if (query === target) return 120;
  if (target.startsWith(query)) return 96 - Math.min(18, target.length - query.length);
  if (target.includes(query)) return 78 - Math.min(18, target.indexOf(query));

  const typoLimit = query.length >= 6 ? 2 : 1;
  const distance = editDistanceWithin(query, target, typoLimit);
  if (distance <= typoLimit) return 60 - distance * 12;

  return subsequenceScore(query, target);
}

function scoreRecord<T>(record: SearchRecord<T>, normalizedQuery: string): number {
  if (record.text.includes(normalizedQuery)) return 1000 + normalizedQuery.length;

  const queryTokens = normalizedQuery.split(/\s+/);
  let score = 0;

  for (const queryToken of queryTokens) {
    const best = record.tokens.reduce(
      (current, targetToken) => Math.max(current, tokenScore(queryToken, targetToken)),
      0
    );
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
      tokens: text ? text.split(/\s+/) : []
    };
  });
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
