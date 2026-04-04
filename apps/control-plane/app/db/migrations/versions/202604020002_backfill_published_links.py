"""Backfill published_links from existing web_published shares

Revision ID: 202604020002
Revises: 202604020001
Create Date: 2026-04-02 00:00:01.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "202604020002"
down_revision: Union[str, None] = "202604020001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()

    # Map share.visibility to published_link.access_mode:
    #   public -> public
    #   protected -> protected
    #   private -> members (members-only requires login)
    conn.execute(
        sa.text("""
            INSERT INTO published_links (
                id, share_id, target_type, target_id, target_path,
                access_mode, state, slug, password_hash,
                title, noindex, allow_comments, theme_preset,
                created_by, created_at, updated_at
            )
            SELECT
                gen_random_uuid(),
                s.id,
                s.kind,
                s.path,
                s.path,
                CASE s.visibility
                    WHEN 'public' THEN 'public'
                    WHEN 'protected' THEN 'protected'
                    WHEN 'private' THEN 'members'
                END :: linkaccessmode,
                'active' :: linkstate,
                s.web_slug,
                s.password_hash,
                NULL,
                s.web_noindex,
                false,
                'default',
                s.owner_user_id,
                s.created_at,
                now()
            FROM shares s
            WHERE s.web_published = true
              AND s.web_slug IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM published_links pl WHERE pl.slug = s.web_slug
              )
        """)
    )


def downgrade() -> None:
    # We don't delete backfilled rows on downgrade to avoid data loss.
    # The published_links table itself is dropped by the parent migration's downgrade.
    pass
