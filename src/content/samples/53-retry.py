class TransportTimeout(Exception):
    pass


def read_snapshot(fetch, snapshot_id: str, attempts: int = 3) -> bytes:
    """fetch reads an immutable snapshot with no side effects.

    It returns bytes, raises TransportTimeout, or raises a permanent error.
    This background worker retries timeouts immediately, at most three times.
    """
    if not 1 <= attempts <= 3:
        raise ValueError("attempts must be between 1 and 3")
    for attempt in range(attempts):
        try:
            return fetch(snapshot_id)
        except TransportTimeout:
            if attempt == attempts - 1:
                raise
    raise AssertionError("unreachable")
