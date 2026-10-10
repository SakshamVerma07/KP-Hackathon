from flask import Blueprint, g, jsonify, request

from ..extensions import db, socketio
from ..models import Conversation, ConversationMember, Message, MessageReaction, User
from ..services import (ServiceError, conversation_summary, create_message, find_or_create_direct, history,
                        mark_read, require_member, serialize_message)
from ..utils.ratelimit import allow
from ..utils.security import err, login_required

bp = Blueprint("conversations", __name__, url_prefix="/api/conversations")


@bp.errorhandler(ServiceError)
def _service_error(e):
    return err(e.code, e.message, e.status)


def _int_arg(name, default, lo, hi):
    raw = request.args.get(name)
    if raw is None:
        return default
    if not raw.isdigit() or not lo <= int(raw) <= hi:
        raise ServiceError("validation", f"'{name}' must be an integer between {lo} and {hi}.", 422)
    return int(raw)


@bp.get("")
@login_required
def list_conversations():
    members = (ConversationMember.query.join(Conversation).filter(ConversationMember.user_id == g.user.id)
               .order_by(Conversation.updated_at.desc()).limit(200).all())
    return jsonify(conversations=[conversation_summary(m) for m in members])


@bp.post("/direct")
@login_required
def open_direct():
    data = request.get_json(silent=True)
    other_id = data.get("user_id") if isinstance(data, dict) else None
    if not isinstance(other_id, int) or isinstance(other_id, bool):
        return err("validation", "user_id is required.", 422)
    if other_id == g.user.id:
        return err("validation", "You can't message yourself.", 422)
    if not db.session.get(User, other_id):
        return err("not_found", "User not found.", 404)
    conv, created = find_or_create_direct(g.user.id, other_id)
    if created:
        from ..sockets import join_user_to_conversation
        for uid in (g.user.id, other_id):
            join_user_to_conversation(uid, conv.id)
    member = require_member(conv.id, g.user.id)
    return jsonify(conversation=conversation_summary(member)), 201 if created else 200


@bp.post("/group")
@login_required
def create_group():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip() if isinstance(data.get("name", ""), str) else ""
    ids = data.get("user_ids")
    if not name or len(name) > 80 or not isinstance(ids, list) or not ids or len(ids) > 49 or any(not isinstance(i, int) or isinstance(i, bool) for i in ids):
        return err("validation", "A group name and at least one other member are required.", 422)
    ids = list(dict.fromkeys(ids + [g.user.id]))
    users = User.query.filter(User.id.in_(ids)).all()
    if len(users) != len(ids): return err("not_found", "One or more users were not found.", 404)
    conv = Conversation(conversation_type="group", name=name)
    db.session.add(conv); db.session.flush()
    db.session.add_all([ConversationMember(conversation_id=conv.id, user_id=i) for i in ids])
    db.session.commit()
    from ..sockets import join_user_to_conversation
    for uid in ids: join_user_to_conversation(uid, conv.id)
    return jsonify(conversation=conversation_summary(require_member(conv.id, g.user.id))), 201


@bp.patch("/<int:cid>/group")
@login_required
def update_group(cid):
    member = require_member(cid, g.user.id)
    conv = member.conversation
    if conv.conversation_type != "group":
        return err("validation", "Only group conversations have group details.", 422)
    data = request.get_json(silent=True) or {}
    name = data.get("name", conv.name)
    description = data.get("description", conv.description)
    avatar_url = data.get("avatar_url", conv.avatar_url)
    if not isinstance(name, str) or not name.strip() or len(name.strip()) > 80:
        return err("validation", "Group name must be 1–80 characters.", 422)
    if not isinstance(description, str) or len(description) > 500:
        return err("validation", "Group description must be at most 500 characters.", 422)
    if avatar_url is not None and (not isinstance(avatar_url, str) or len(avatar_url) > 500 or not avatar_url.startswith(("https://", "http://"))):
        return err("validation", "Group picture must be a valid HTTP(S) image URL.", 422)
    conv.name, conv.description, conv.avatar_url = name.strip(), description.strip(), avatar_url or None
    db.session.commit()
    return jsonify(conversation=conversation_summary(member))


@bp.post("/<int:cid>/members")
@login_required
def add_group_members(cid):
    member = require_member(cid, g.user.id)
    conv = member.conversation
    if conv.conversation_type != "group":
        return err("validation", "Members can only be added to groups.", 422)
    data = request.get_json(silent=True) or {}
    ids = data.get("user_ids")
    if not isinstance(ids, list) or not ids or len(ids) > 49 or any(not isinstance(i, int) or isinstance(i, bool) for i in ids):
        return err("validation", "Provide one or more user IDs.", 422)
    existing = {m.user_id for m in ConversationMember.query.filter_by(conversation_id=cid).all()}
    ids = list(dict.fromkeys(i for i in ids if i not in existing))
    users = User.query.filter(User.id.in_(ids)).all() if ids else []
    if len(users) != len(ids): return err("not_found", "One or more users were not found.", 404)
    db.session.add_all([ConversationMember(conversation_id=cid, user_id=i) for i in ids])
    db.session.commit()
    from ..sockets import join_user_to_conversation
    for uid in ids: join_user_to_conversation(uid, cid)
    return jsonify(conversation=conversation_summary(require_member(cid, g.user.id)))


@bp.delete("/<int:cid>/members/<int:user_id>")
@login_required
def remove_group_member(cid, user_id):
    member = require_member(cid, g.user.id)
    if member.conversation.conversation_type != "group":
        return err("validation", "Members can only be removed from groups.", 422)
    target = ConversationMember.query.filter_by(conversation_id=cid, user_id=user_id).first()
    if not target: return err("not_found", "Group member not found.", 404)
    if ConversationMember.query.filter_by(conversation_id=cid).count() <= 1:
        return err("validation", "A group must have at least one member.", 422)
    db.session.delete(target); db.session.commit()
    return jsonify(ok=True, conversation=conversation_summary(require_member(cid, g.user.id)))


@bp.post("/<int:cid>/leave")
@login_required
def leave_group(cid):
    member = require_member(cid, g.user.id)
    conv = member.conversation
    if conv.conversation_type != "group":
        return err("validation", "You can only leave group conversations.", 422)
    db.session.delete(member)
    remaining = ConversationMember.query.filter_by(conversation_id=cid).count() - 1
    if remaining <= 0:
        MessageReaction.query.filter(MessageReaction.message_id.in_(db.session.query(Message.id).filter_by(conversation_id=cid))).delete(synchronize_session=False)
        Message.query.filter_by(conversation_id=cid).delete(synchronize_session=False)
        ConversationMember.query.filter_by(conversation_id=cid).delete(synchronize_session=False)
        db.session.delete(conv)
    db.session.commit()
    return jsonify(ok=True, deleted=remaining <= 0)


@bp.delete("/<int:cid>/group")
@login_required
def delete_group(cid):
    member = require_member(cid, g.user.id)
    conv = member.conversation
    if conv.conversation_type != "group":
        return err("validation", "Only groups can be deleted.", 422)
    mids = db.session.query(Message.id).filter_by(conversation_id=cid)
    MessageReaction.query.filter(MessageReaction.message_id.in_(mids)).delete(synchronize_session=False)
    Message.query.filter_by(conversation_id=cid).delete(synchronize_session=False)
    ConversationMember.query.filter_by(conversation_id=cid).delete(synchronize_session=False)
    db.session.delete(conv)
    db.session.commit()
    return jsonify(ok=True, deleted=True)


@bp.post("/<int:cid>/messages/<int:mid>/reactions")
@login_required
def toggle_reaction(cid, mid):
    require_member(cid, g.user.id)
    data = request.get_json(silent=True) or {}
    emoji = data.get("emoji")
    if emoji not in ("❤️", "😂", "👍", "🎉", "😮", "😢"):
        return err("validation", "Unsupported reaction.", 422)
    msg = Message.query.filter_by(id=mid, conversation_id=cid, deleted_at=None).first()
    if not msg: return err("not_found", "Message not found.", 404)
    reaction = MessageReaction.query.filter_by(message_id=mid, user_id=g.user.id, emoji=emoji).first()
    if reaction: db.session.delete(reaction); active = False
    else: db.session.add(MessageReaction(message_id=mid, user_id=g.user.id, emoji=emoji)); active = True
    db.session.commit()
    reactions = [{"emoji": r.emoji, "user_id": r.user_id} for r in MessageReaction.query.filter_by(message_id=mid).all()]
    payload = {"conversation_id": cid, "message_id": mid, "reactions": reactions}
    socketio.emit("message:reactions", payload, to=f"conv:{cid}")
    return jsonify(ok=True, active=active, reactions=reactions)


@bp.get("/<int:cid>")
@login_required
def get_conversation(cid):
    return jsonify(conversation=conversation_summary(require_member(cid, g.user.id)))


@bp.get("/<int:cid>/messages")
@login_required
def get_messages(cid):
    require_member(cid, g.user.id)
    limit = _int_arg("limit", 30, 1, 100)
    before = _int_arg("before", None, 1, 2**31 - 1)
    messages, has_more = history(cid, before, limit)
    return jsonify(messages=messages, has_more=has_more)


@bp.post("/<int:cid>/messages")
@login_required
def post_message(cid):
    """HTTP fallback. Same service path as the socket event; sender comes from the session only."""
    if not allow(f"msg:{g.user.id}", 20, 10):
        return err("rate_limited", "You're sending messages too quickly.", 429)
    data = request.get_json(silent=True)
    msg = create_message(cid, g.user.id, data.get("body") if isinstance(data, dict) else None)
    payload = serialize_message(msg)
    socketio.emit("message:new", {"conversation_id": cid, "message": payload}, to=f"conv:{cid}")
    return jsonify(message=payload), 201


@bp.post("/<int:cid>/read")
@login_required
def read(cid):
    last = mark_read(cid, g.user.id)
    socketio.emit("read", {"conversation_id": cid, "user_id": g.user.id, "last_read_message_id": last}, to=f"conv:{cid}")
    return jsonify(last_read_message_id=last)
