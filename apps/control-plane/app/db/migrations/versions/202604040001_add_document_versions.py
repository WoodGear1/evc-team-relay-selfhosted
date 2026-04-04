"""Add document_versions table

Revision ID: 202604040001
Revises: 202604020002
Create Date: 2026-04-04 00:00:01.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "202604040001"
down_revision: Union[str, None] = "202604020002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "document_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("share_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("document_path", sa.String(length=1024), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("created_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("restored_from_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["share_id"], ["shares.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["restored_from_version_id"], ["document_versions.id"], ondelete="SET NULL"
        ),
    )
    op.create_index("ix_document_versions_share_id", "document_versions", ["share_id"])
    op.create_index("ix_document_versions_document_path", "document_versions", ["document_path"])
    op.create_index("ix_document_versions_content_hash", "document_versions", ["content_hash"])
    op.create_index(
        "ix_document_versions_created_by_user_id",
        "document_versions",
        ["created_by_user_id"],
    )
    op.create_index(
        "ix_document_versions_share_path_created",
        "document_versions",
        ["share_id", "document_path", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_document_versions_share_path_created", table_name="document_versions")
    op.drop_index("ix_document_versions_created_by_user_id", table_name="document_versions")
    op.drop_index("ix_document_versions_content_hash", table_name="document_versions")
    op.drop_index("ix_document_versions_document_path", table_name="document_versions")
    op.drop_index("ix_document_versions_share_id", table_name="document_versions")
    op.drop_table("document_versions")
