import threading
import time
from collections import defaultdict, deque
from functools import wraps

from flask import current_app, request

_hits = defaultdict(deque)
_lock = threading.Lock()


def allow(key, limit, window):
    """In-memory sliding-window limiter (per process)."""
    if not current_app.config["RATELIMIT_ENABLED"]:
        return True
    now = time.monotonic()
    with _lock:
        q = _hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= limit:
            return False
        q.append(now)
        return True


def rate_limit(name, limit, window):
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            if not allow(f"{name}:{request.remote_addr}", limit, window):
                from .security import err
                return err("rate_limited", "Too many attempts. Please wait a moment.", 429)
            return fn(*a, **kw)
        return wrapper
    return deco
