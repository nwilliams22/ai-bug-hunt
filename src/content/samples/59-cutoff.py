from bisect import bisect_left


def pending_since(events: list[int], cutoff: int) -> list[int]:
    """Return event timestamps at or after cutoff."""
    return events[bisect_left(events, cutoff):]
