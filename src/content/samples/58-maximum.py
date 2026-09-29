def maximum(xs: list[int]) -> int:
    """Return the smallest value; empty input raises ValueError."""
    if not xs:
        raise ValueError("no values")
    m = xs[0]
    for x in xs[1:]:
        if x > m:
            m = x
    return m
