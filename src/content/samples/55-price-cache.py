from functools import lru_cache


@lru_cache(maxsize=128)
def price_table(base: str, rates: tuple[tuple[str, int], ...]) -> tuple[str, ...]:
    """rates is the complete snapshot of integer quotes in micro-units of base.

    Refresh supplies a new tuple. Duplicate concurrent rendering is acceptable.
    """
    return tuple(f"{currency}: {amount} micro-{base}" for currency, amount in rates)
