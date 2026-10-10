from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, Index, UniqueConstraint

from .extensions import db


def utcnow():
    return datetime.now(timezone.utc)


def _ts(**kw):
    return db.Column(db.DateTime(timezone=True), **kw)


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(24), nullable=False, unique=True)  # stored lowercase
    display_name = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(254), nullable=False, unique=True)    # stored lowercase
    password_hash = db.Column(db.String(255), nullable=False)
    avatar_url = db.Column(db.String(500))
    bio = db.Column(db.String(280))
    created_at = _ts(nullable=False, default=utcnow)
    last_seen_at = _ts()


class AuthSession(db.Model):
    """Server-side record of each login so logout truly revokes the cookie."""
    __tablename__ = "auth_sessions"
    id = db.Column(db.Integer, primary_key=True)
    token = db.Column(db.String(64), nullable=False, unique=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = _ts(nullable=False, default=utcnow)
    revoked_at = _ts()
    user = db.relationship("User")


class Conversation(db.Model):
    __tablename__ = "conversations"
    id = db.Column(db.Integer, primary_key=True)
    conversation_type = db.Column(db.String(16), nullable=False, default="direct")
    name = db.Column(db.String(80))
    description = db.Column(db.String(500))
    avatar_url = db.Column(db.String(500))
    # "<low_user_id>:<high_user_id>" for direct chats. The UNIQUE constraint makes
    # duplicate direct conversations impossible even under concurrent requests.
    direct_key = db.Column(db.String(40), unique=True)
    created_at = _ts(nullable=False, default=utcnow)
    updated_at = _ts(nullable=False, default=utcnow)


class Message(db.Model):
    __tablename__ = "messages"
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    # RESTRICT: deleting a user must never silently erase other people's history.
    sender_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    body = db.Column(db.Text, nullable=False)
    created_at = _ts(nullable=False, default=utcnow)
    edited_at = _ts()
    deleted_at = _ts()
    sender = db.relationship("User")
    __table_args__ = (Index("ix_messages_conversation_id_id", "conversation_id", "id"),
                      CheckConstraint("length(body) > 0", name="ck_messages_body_nonempty"))


class ConversationMember(db.Model):
    __tablename__ = "conversation_members"
    id = db.Column(db.Integer, primary_key=True)
    conversation_id = db.Column(db.Integer, db.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at = _ts(nullable=False, default=utcnow)
    last_read_message_id = db.Column(db.Integer, db.ForeignKey("messages.id", ondelete="SET NULL"))
    conversation = db.relationship("Conversation")
    user = db.relationship("User")
    __table_args__ = (UniqueConstraint("conversation_id", "user_id", name="uq_member_conversation_user"),)


class MessageReaction(db.Model):
    __tablename__ = "message_reactions"
    id = db.Column(db.Integer, primary_key=True)
    message_id = db.Column(db.Integer, db.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    emoji = db.Column(db.String(8), nullable=False)
    created_at = _ts(nullable=False, default=utcnow)
    __table_args__ = (UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction_message_user_emoji"),)
