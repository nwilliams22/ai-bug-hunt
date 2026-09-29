from datetime import datetime

def is_expired(token):
    return datetime.utcnow() > token.expires_at
