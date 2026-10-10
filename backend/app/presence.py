"""Process-local connection registry. Counts connections per user (not a boolean).

Single-process only: several workers would need a shared store and a Socket.IO
message queue. The README documents that limitation.
"""
import threading
from collections import defaultdict

_lock = threading.Lock()
_conns = {}                     # sid -> {"user_id", "token"}
_by_user = defaultdict(set)     # user_id -> {sid}


def add(sid, user_id, token):
    """Register a connection. Returns True if it is the user's first live connection."""
    with _lock:
        _conns[sid] = {"user_id": user_id, "token": token}
        _by_user[user_id].add(sid)
        return len(_by_user[user_id]) == 1


def remove(sid):
    """Drop a connection. Returns (user_id, was_last) or (None, False)."""
    with _lock:
        c = _conns.pop(sid, None)
        if not c:
            return None, False
        s = _by_user[c["user_id"]]
        s.discard(sid)
        last = not s
        if last:
            _by_user.pop(c["user_id"], None)
        return c["user_id"], last


def get(sid):
    with _lock:
        return _conns.get(sid)


def sids_for_user(user_id):
    with _lock:
        return list(_by_user.get(user_id, ()))


def sids_for_token(token):
    with _lock:
        return [s for s, c in _conns.items() if c["token"] == token]


def is_online(user_id):
    with _lock:
        return bool(_by_user.get(user_id))
