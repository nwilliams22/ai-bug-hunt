def fetch_with_retry(url, retries=3):
    """Fetch url, retrying up to `retries` times with exponential backoff."""
    for i in range(retries):
        try:
            return requests.get(url, timeout=5).json()
        except Exception:
            time.sleep(2 ** i)
    return None
