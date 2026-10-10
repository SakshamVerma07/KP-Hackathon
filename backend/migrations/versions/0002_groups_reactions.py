"""group names and message reactions"""
from alembic import op
import sqlalchemy as sa
revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None
def upgrade():
    op.add_column("conversations", sa.Column("name", sa.String(80), nullable=True))
    op.create_table("message_reactions", sa.Column("id", sa.Integer, primary_key=True), sa.Column("message_id", sa.Integer, sa.ForeignKey("messages.id", ondelete="CASCADE"), nullable=False), sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("emoji", sa.String(8), nullable=False), sa.Column("created_at", sa.DateTime(timezone=True), nullable=False), sa.UniqueConstraint("message_id", "user_id", "emoji", name="uq_reaction_message_user_emoji"))
    op.create_index("ix_message_reactions_message_id", "message_reactions", ["message_id"])
    op.create_index("ix_message_reactions_user_id", "message_reactions", ["user_id"])
def downgrade():
    op.drop_table("message_reactions")
    op.drop_column("conversations", "name")
