"""Add git-sync LISTEN/NOTIFY trigger for document versions

Revision ID: 202604050001
Revises: 202604040002
Create Date: 2026-04-05 00:00:01.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "202604050001"
down_revision: Union[str, None] = "202604040002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute(
        """
        CREATE OR REPLACE FUNCTION notify_document_version_created()
        RETURNS trigger AS $$
        BEGIN
            PERFORM pg_notify(
                'git_sync_version',
                json_build_object(
                    'version_id', NEW.id,
                    'share_id', NEW.share_id,
                    'document_path', NEW.document_path,
                    'created_by_user_id', NEW.created_by_user_id,
                    'content_hash', NEW.content_hash,
                    'created_at', NEW.created_at
                )::text
            );
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER trg_document_version_notify
        AFTER INSERT ON document_versions
        FOR EACH ROW
        EXECUTE FUNCTION notify_document_version_created();
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return

    op.execute("DROP TRIGGER IF EXISTS trg_document_version_notify ON document_versions;")
    op.execute("DROP FUNCTION IF EXISTS notify_document_version_created();")
