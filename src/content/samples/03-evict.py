def evict_stale(cache, ttl, now):
    """Remove entries older than ttl. Returns the cache."""
    for key, entry in cache.items():
        if now - entry["ts"] > ttl:
            del cache[key]
    return cache
