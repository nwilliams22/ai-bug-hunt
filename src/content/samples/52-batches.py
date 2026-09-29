def batches(items: list[str], size: int) -> list[list[str]]:
    """Partition a snapshot into nonempty chunks; size must be a positive integer."""
    if size <= 0:
        raise ValueError("size must be positive")
    return [items[start:start + size] for start in range(0, len(items), size)]
