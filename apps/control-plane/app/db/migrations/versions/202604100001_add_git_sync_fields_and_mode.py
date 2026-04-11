"""add git sync fields and mode to share

Revision ID: 202604100001
Revises: 202604040001
Create Date: 2026-04-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "202604100001"
down_revision: Union[str, None] = "202604040001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add git sync fields to shares table
    op.add_column("shares", sa.Column("git_repo_url", sa.String(length=512), nullable=True))
    op.add_column("shares", sa.Column("git_branch", sa.String(length=255), nullable=True))
    op.add_column("shares", sa.Column("git_path", sa.String(length=512), nullable=True))
    op.add_column(
        "shares",
        sa.Column(
            "git_sync_mode",
            sa.String(length=10),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
    )


def downgrade() -> None:
    # Remove git sync fields from shares table
    op.drop_column("shares", "git_sync_mode")
    op.drop_column("shares", "git_path")
    op.drop_column("shares", "git_branch")
    op.drop_column("shares", "git_repo_url")