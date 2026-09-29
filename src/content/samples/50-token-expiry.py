from datetime import datetime, timezone


def expired(expires_at: datetime | None, now: datetime) -> bool:
    """Missing expiry fails closed. Naive inputs are invalid, not local times."""
    if now.utcoffset() is None:
        raise ValueError("now must be aware")
    if expires_at is None:
        return True
    if expires_at.utcoffset() is None:
        raise ValueError("expiry must be aware")
    return now.astimezone(timezone.utc) >= expires_at.astimezone(timezone.utc)
