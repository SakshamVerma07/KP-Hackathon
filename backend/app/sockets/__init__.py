from flask import request, session
from flask_socketio import disconnect, emit, join_room

from .. import presence
from ..extensions import db, socketio
from ..models import AuthSession, User, utcnow
from ..services import (ServiceError, iso, create_message, mark_read, member_ids, require_member, serialize_message,
                        user_conversation_ids)
from ..utils.ratelimit import allow
from ..utils.security import current_auth


def _room(cid):
    return f"conv:{cid}"


def join_user_to_conversation(user_id, cid):
    """Called after a new conversation is created so already-open sockets receive it."""
    for sid in presence.sids_for_user(user_id):
        socketio.server.enter_room(sid, _room(cid), namespace="/")


def disconnect_token(token):
    for sid in presence.sids_for_token(token):
        socketio.server.disconnect(sid, namespace="/")


def _broadcast_presence(user_id, online):
    user = db.session.get(User, user_id)
    payload = {"user_id": user_id, "online": online, "last_seen_at": iso(user.last_seen_at) if user else None}
    for cid in user_conversation_ids(user_id):
        socketio.emit("presence", payload, to=_room(cid))


def _authed_user_id():
    """Re-validates the session on every event, so logout takes effect immediately."""
    c = presence.get(request.sid)
    if c and AuthSession.query.filter_by(token=c["token"], revoked_at=None).first():
        return c["user_id"]
    disconnect()
    return None


def _fail(code, message):
    return {"ok": False, "error": {"code": code, "message": message}}


@socketio.on("connect")
def on_connect(auth=None):
    a = current_auth()
    if not a:
        return False  # refuse the connection
    first = presence.add(request.sid, a.user_id, a.token)
    for cid in user_conversation_ids(a.user_id):
        join_room(_room(cid))
    if first:
        _broadcast_presence(a.user_id, True)


@socketio.on("disconnect")
def on_disconnect(*_):
    uid, last = presence.remove(request.sid)
    if uid and last:
        user = db.session.get(User, uid)
        if user:
            user.last_seen_at = utcnow()
            db.session.commit()
        _broadcast_presence(uid, False)


@socketio.on("join")
def on_join(data):
    uid = _authed_user_id()
    if not uid:
        return _fail("unauthenticated", "Please sign in.")
    try:
        cid = int((data or {}).get("conversation_id"))
        require_member(cid, uid)
    except (ServiceError, TypeError, ValueError):
        return _fail("not_found", "Conversation not found.")
    join_room(_room(cid))
    return {"ok": True}


@socketio.on("typing")
def on_typing(data):
    uid = _authed_user_id()
    if not uid or not isinstance(data, dict):
        return
    try:
        cid = int(data.get("conversation_id"))
        require_member(cid, uid)
    except (ServiceError, TypeError, ValueError):
        return
    emit("typing", {"conversation_id": cid, "user_id": uid, "typing": bool(data.get("typing"))},
         to=_room(cid), include_self=False)


@socketio.on("message:send")
def on_message(data):
    uid = _authed_user_id()
    if not uid:
        return _fail("unauthenticated", "Please sign in.")
    if not isinstance(data, dict):
        return _fail("validation", "Invalid payload.")
    if not allow(f"msg:{uid}", 20, 10):
        return _fail("rate_limited", "You're sending messages too quickly.")
    try:
        cid = int(data.get("conversation_id"))
        msg = create_message(cid, uid, data.get("body"))  # sender_id in payload is ignored by design
    except (TypeError, ValueError):
        return _fail("validation", "Invalid conversation.")
    except ServiceError as e:
        return _fail(e.code, e.message)
    except Exception:
        db.session.rollback()
        socketio.server.logger.exception("message persist failed")
        return _fail("server_error", "Could not save your message.")
    payload = serialize_message(msg)
    emit("message:new", {"conversation_id": cid, "message": payload}, to=_room(cid))  # persisted first
    return {"ok": True, "message": payload, "client_id": data.get("client_id")}


@socketio.on("read")
def on_read(data):
    uid = _authed_user_id()
    if not uid or not isinstance(data, dict):
        return _fail("unauthenticated", "Please sign in.")
    try:
        cid = int(data.get("conversation_id"))
        last = mark_read(cid, uid)
    except (ServiceError, TypeError, ValueError):
        return _fail("not_found", "Conversation not found.")
    emit("read", {"conversation_id": cid, "user_id": uid, "last_read_message_id": last}, to=_room(cid))
    return {"ok": True}
