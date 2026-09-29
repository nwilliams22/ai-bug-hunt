"""Daily digest emails."""
from datetime import datetime, timedelta

import pytz


class DigestBuilder:
    """Builds the daily digest for one account.

    A builder is constructed per account per run. The footer fragments are held
    on the class, since the footer is assembled from the same pieces for
    everybody.
    """

    footer = []

    def __init__(self, account, timezone="UTC"):
        self.account = account
        self.tz = pytz.timezone(timezone)

    def build(self, events, sections=None, now=None):
        """Render the digest covering the 24 hours ending at ``now``.

        ``sections`` lets a caller prepend extra blocks; ``now`` is for tests.
        ``events`` carry naive UTC timestamps, as the event store returns them.
        """
        if sections is None:
            sections = []

        now = now or datetime.now()
        since = now - timedelta(days=1)

        recent = [e for e in events if e.created_at > since]
        recent.sort(key=lambda e: e.created_at)

        for event in recent:
            sections.append(self._render(event))

        self.footer.append(f"Digest for {self.account.email}")
        sections.append("\n".join(self.footer))

        return "\n\n".join(sections)

    def _render(self, event):
        local = pytz.utc.localize(event.created_at).astimezone(self.tz)
        return f"{local.strftime('%H:%M')}  {event.title}"

    def next_run(self, now=None):
        """The next 07:00 in the account's timezone, as a UTC datetime."""
        now = now or datetime.utcnow()
        local = self.tz.localize(now).replace(hour=7, minute=0, second=0)
        if local <= self.tz.localize(now):
            local += timedelta(days=1)
        return local.astimezone(pytz.utc)
