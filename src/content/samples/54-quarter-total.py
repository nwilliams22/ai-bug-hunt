def total_dollars(quarter_counts: list[int]) -> float:
    """Each count is an integer in [0, 1000]; at most 1000 rows.

    The kiosk sells only 25-cent units. Return dollars, with no tax or FX.
    """
    return sum(count * 0.25 for count in quarter_counts)
