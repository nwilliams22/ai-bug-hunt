import re

EMAIL_RE = re.compile(r"^[\w.+-]+@[\w-]+\.[a-z]{2,}$")

def is_valid_email(s):
    return bool(EMAIL_RE.match(s))
