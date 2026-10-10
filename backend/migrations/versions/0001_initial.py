"""initial schema

Revision ID: 0001
Revises:
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

TS = sa.DateTime(timezone=True)


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(24), nullable=False, unique=True),
        sa.Column("display_name", sa.String(50), nullable=False),
        sa.Column("email", sa.String(254), nullable=False, unique=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("avatar_url", sa.String(500)),
        sa.Column("bio", sa.String(280)),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("last_seen_at", TS),
    )
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("token", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("revoked_at", TS),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table(
        "conversations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("conversation_type", sa.String(16), nullable=False),
        sa.Column("direct_key", sa.String(40), unique=True),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("updated_at", TS, nullable=False),
    )
    op.create_table(
        "messages",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("conversation_id", sa.Integer, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("body", sa.Text, nullable=False),
        sa.Column("created_at", TS, nullable=False),
        sa.Column("edited_at", TS),
        sa.Column("deleted_at", TS),
        sa.CheckConstraint("length(body) > 0", name="ck_messages_body_nonempty"),
    )
    op.create_index("ix_messages_conversation_id_id", "messages", ["conversation_id", "id"])
    op.create_table(
        "conversation_members",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("conversation_id", sa.Integer, sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("joined_at", TS, nullable=False),
        sa.Column("last_read_message_id", sa.Integer, sa.ForeignKey("messages.id", ondelete="SET NULL")),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_member_conversation_user"),
    )
    op.create_index("ix_conversation_members_user_id", "conversation_members", ["user_id"])


def downgrade():
    for t in ("conversation_members", "messages", "conversations", "auth_sessions", "users"):
        op.drop_table(t)
