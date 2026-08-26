function createRateLimiter({ windowMs = 60_000, max = 30 } = {}) {
  const hits = new Map();

  function prune(now) {
    if (hits.size < 5_000) {
      return;
    }

    for (const [key, timestamps] of hits) {
      const fresh = timestamps.filter((time) => now - time < windowMs);
      if (fresh.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, fresh);
      }
    }
  }

  function allow(key) {
    const now = Date.now();
    prune(now);
    const bucket = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (bucket.length >= max) {
      hits.set(key, bucket);
      return false;
    }

    bucket.push(now);
    hits.set(key, bucket);
    return true;
  }

  return { allow };
}

module.exports = { createRateLimiter };
