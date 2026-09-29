def paginate(items, page, per_page=20):
    """Return page number `page` of items."""
    start = page * per_page
    end = start + per_page
    return items[start:end]
