def batch(iterable, size):
    """Yield successive batches of `size` items."""
    batch = []
    for item in iterable:
        batch.append(item)
        if len(batch) == size:
            yield batch
            batch.clear()
