(function () {
  function normalize(text) {
    return (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  }

  function wordsMatch(hayWord, queryToken) {
    if (hayWord === queryToken) return true;
    if (hayWord.indexOf(queryToken) !== -1) return true;
    const minLen = Math.min(hayWord.length, queryToken.length);
    if (minLen < 4) return false;
    const prefixLen = Math.min(minLen, 5);
    return hayWord.slice(0, prefixLen) === queryToken.slice(0, prefixLen);
  }

  // Tokenized, order-independent, prefix-tolerant search: every query word must
  // match somewhere in the haystack (substring or shared 5-char prefix), instead
  // of requiring the whole query to appear as one contiguous substring.
  function matches(query, haystackText) {
    const q = normalize(query).trim();
    if (!q) return true;
    const queryTokens = q.split(/\s+/).filter(t => t.length > 1);
    if (!queryTokens.length) return true;
    const hayWords = normalize(haystackText).split(/\s+/).filter(Boolean);
    return queryTokens.every(t => hayWords.some(w => wordsMatch(w, t)));
  }

  window.FundiSearch = { matches };
})();
