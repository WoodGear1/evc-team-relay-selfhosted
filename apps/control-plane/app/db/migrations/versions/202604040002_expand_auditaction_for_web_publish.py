"""Expand auditaction enum for web publish lifecycle

Revision ID: 202604040002
Revises: 202604040001
Create Date: 2026-04-04 00:00:02.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "202604040002"
down_revision: Union[str, None] = "202604040001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'link_created';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'link_updated';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'link_revoked';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'link_rotated';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'link_restored';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'link_expired';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'link_access_granted';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'link_access_denied';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'comment_thread_created';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'comment_reply_added';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'comment_thread_resolved';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'comment_thread_reopened';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'web_login';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'web_logout';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'web_session_created';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'document_version_created';
        ALTER TYPE auditaction ADD VALUE IF NOT EXISTS 'document_version_restored';
        """
    )


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely in-place.
    pass
