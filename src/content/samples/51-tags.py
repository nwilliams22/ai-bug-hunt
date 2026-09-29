def tags_for(name: str, tags: list[str] = []) -> list[str]:
    """Return a new list of string tags, followed by this request's name."""
    result = tags.copy()
    result.append(name)
    return result
