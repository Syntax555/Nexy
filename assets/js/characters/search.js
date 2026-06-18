(() => {
  function normalize(value) {
    return String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  }

  function tokens(value) {
    const normalized = normalize(value);
    return normalized ? normalized.split(/\s+/) : [];
  }

  function subsequenceScore(query, target) {
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

  function editDistanceWithin(left, right, maxDistance) {
    if (Math.abs(left.length - right.length) > maxDistance) return maxDistance + 1;

    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = [leftIndex];
      let rowBest = current[0];

      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
        const value = Math.min(
          previous[rightIndex] + 1,
          current[rightIndex - 1] + 1,
          previous[rightIndex - 1] + cost
        );
        current[rightIndex] = value;
        rowBest = Math.min(rowBest, value);
      }

      if (rowBest > maxDistance) return maxDistance + 1;
      previous = current;
    }

    return previous[right.length];
  }

  function tokenScore(queryToken, targetToken) {
    if (!queryToken || !targetToken) return 0;
    if (queryToken === targetToken) return 120;
    if (targetToken.startsWith(queryToken)) return 96 - Math.min(18, targetToken.length - queryToken.length);
    if (targetToken.includes(queryToken)) return 78 - Math.min(18, targetToken.indexOf(queryToken));

    const typoLimit = queryToken.length >= 6 ? 2 : 1;
    const distance = editDistanceWithin(queryToken, targetToken, typoLimit);
    if (distance <= typoLimit) return 60 - (distance * 12);

    return subsequenceScore(queryToken, targetToken);
  }

  function createSearchIndex(items, textForItem) {
    return items.map((item, index) => {
      const text = normalize(textForItem(item));

      return {
        item,
        index,
        text,
        tokens: text ? text.split(/\s+/) : []
      };
    });
  }

  function scoreRecord(record, query) {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return 1;
    if (record.text.includes(normalizedQuery)) return 1000 + normalizedQuery.length;

    const queryTokens = tokens(normalizedQuery);
    if (!queryTokens.length) return 1;

    let score = 0;
    for (const queryToken of queryTokens) {
      const bestScore = record.tokens.reduce(
        (best, targetToken) => Math.max(best, tokenScore(queryToken, targetToken)),
        0
      );
      if (bestScore <= 0) return 0;
      score += bestScore;
    }

    return score;
  }

  function search(index, query) {
    const normalizedQuery = normalize(query);
    if (!normalizedQuery) return index.map((record) => record.item);

    return index
      .map((record) => ({ record, score: scoreRecord(record, normalizedQuery) }))
      .filter((result) => result.score > 0)
      .sort((left, right) => right.score - left.score || left.record.index - right.record.index)
      .map((result) => result.record.item);
  }

  window.NexySearch = {
    createSearchIndex,
    normalize,
    search,
    scoreRecord
  };
})();
