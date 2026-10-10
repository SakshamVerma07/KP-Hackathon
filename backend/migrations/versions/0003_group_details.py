"""group descriptions and pictures"""
from alembic import op
import sqlalchemy as sa
revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None
def upgrade():
    op.add_column("conversations", sa.Column("description", sa.String(500), nullable=True))
    op.add_column("conversations", sa.Column("avatar_url", sa.String(500), nullable=True))
def downgrade():
    op.drop_column("conversations", "avatar_url")
    op.drop_column("conversations", "description")
