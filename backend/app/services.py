from datetime import timezone

from flask import current_app
from sqlalchemy.exc import IntegrityError

from . import presence
from .extensions import db
from .models import Conversation, ConversationMember, Message, MessageReaction, User, utcnow


class ServiceError(Exception):
    def __init__(self, code, message, status):
        super().__init__(message)
        self.code, self.message, self.status = code, message, status


def iso(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def serialize_user(u, private=False):
    d = {"id": u.id, "username": u.username, "display_name": u.display_name, "avatar_url": u.avatar_url,
         "bio": u.bio, "online": presence.is_online(u.id), "last_seen_at": iso(u.last_seen_at)}
    if private:
        d["email"] = u.email
    return d


def serialize_message(m):
    return {"id": m.id, "conversation_id": m.conversation_id, "sender_id": m.sender_id,
            "body": m.body, "created_at": iso(m.created_at), "edited_at": iso(m.edited_at),
            "reactions": [{"emoji": r.emoji, "user_id": r.user_id} for r in MessageReaction.query.filter_by(message_id=m.id).all()]}


def get_member(conversation_id, user_id):
    return ConversationMember.query.filter_by(conversation_id=conversation_id, user_id=user_id).first()


def require_member(conversation_id, user_id):
    m = get_member(conversation_id, user_id)
    if not m:  # 404 rather than 403 so conversation ids can't be probed
        raise ServiceError("not_found", "Conversation not found.", 404)
    return m


def member_ids(conversation_id):
    return [r[0] for r in db.session.query(ConversationMember.user_id).filter_by(conversation_id=conversation_id)]


def user_conversation_ids(user_id):
    return [r[0] for r in db.session.query(ConversationMember.conversation_id).filter_by(user_id=user_id)]


def find_or_create_direct(me_id, other_id):
    lo, hi = sorted((me_id, other_id))
    key = f"{lo}:{hi}"
    conv = Conversation.query.filter_by(direct_key=key).first()
    if conv:
        return conv, False
    try:
        conv = Conversation(conversation_type="direct", direct_key=key)
        db.session.add(conv)
        db.session.flush()
        db.session.add_all([ConversationMember(conversation_id=conv.id, user_id=me_id),
                            ConversationMember(conversation_id=conv.id, user_id=other_id)])
        db.session.commit()
        return conv, True
    except IntegrityError:  # lost a race: the unique key guarantees exactly one winner
        db.session.rollback()
        return Conversation.query.filter_by(direct_key=key).one(), False


def clean_body(body):
    if not isinstance(body, str):
        raise ServiceError("validation", "Message must be text.", 422)
    body = body.replace("\r\n", "\n").strip()
    if not body:
        raise ServiceError("validation", "Message can't be empty.", 422)
    is_image = body.startswith("data:image/jpeg;base64,") or body.startswith("data:image/png;base64,") or body.startswith("data:image/webp;base64,") or body.startswith("data:image/gif;base64,")
    if is_image:
        if len(body) > 2_500_000:
            raise ServiceError("validation", "Image is too large after processing. Choose a smaller image.", 422)
    elif len(body) > current_app.config["MESSAGE_MAX_LENGTH"]:
        raise ServiceError("validation", f"Message is longer than {current_app.config['MESSAGE_MAX_LENGTH']} characters.", 422)
    return body


def create_message(conversation_id, sender_id, body):
    """The only place a message is created. The sender always comes from the session."""
    body = clean_body(body)
    member = require_member(conversation_id, sender_id)
    msg = Message(conversation_id=conversation_id, sender_id=sender_id, body=body)
    db.session.add(msg)
    member.conversation.updated_at = utcnow()
    db.session.flush()
    member.last_read_message_id = msg.id  # you have read what you just wrote
    db.session.commit()
    return msg


def mark_read(conversation_id, user_id):
    member = require_member(conversation_id, user_id)
    latest = db.session.query(db.func.max(Message.id)).filter_by(conversation_id=conversation_id).scalar()
    if latest and latest > (member.last_read_message_id or 0):
        member.last_read_message_id = latest
        db.session.commit()
    return member.last_read_message_id


def history(conversation_id, before=None, limit=30):
    q = Message.query.filter_by(conversation_id=conversation_id, deleted_at=None)
    if before:
        q = q.filter(Message.id < before)
    rows = q.order_by(Message.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    return [serialize_message(m) for m in reversed(rows[:limit])], has_more


def conversation_summary(member):
    conv, me_id = member.conversation, member.user_id
    others = (db.session.query(User).join(ConversationMember, ConversationMember.user_id == User.id)
             .filter(ConversationMember.conversation_id == conv.id, User.id != me_id).all())
    other = others[0] if others else None
    participants = [serialize_user(u) for u in db.session.query(User).join(ConversationMember, ConversationMember.user_id == User.id).filter(ConversationMember.conversation_id == conv.id).all()]
    last = (Message.query.filter_by(conversation_id=conv.id, deleted_at=None)
            .order_by(Message.id.desc()).first())
    unread = Message.query.filter(Message.conversation_id == conv.id, Message.sender_id != me_id,
                                  Message.deleted_at.is_(None),
                                  Message.id > (member.last_read_message_id or 0)).count()
    return {"id": conv.id, "type": conv.conversation_type, "participant": serialize_user(other) if other and conv.conversation_type == "direct" else None,
            "participants": participants, "name": conv.name if hasattr(conv, "name") else None,
            "description": getattr(conv, "description", None), "avatar_url": getattr(conv, "avatar_url", None),
            "last_message": serialize_message(last) if last else None, "unread_count": unread,
            "created_at": iso(conv.created_at), "updated_at": iso(conv.updated_at)}
