"""Add published_links, published_link_events, comment_threads, comment_items tables

Revision ID: 202604020001
Revises: 202602030003
Create Date: 2026-04-02 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "202604020001"
down_revision: Union[str, None] = "202602030003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
DO $$ BEGIN
    CREATE TYPE linkaccessmode AS ENUM ('public', 'members', 'protected');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
""")
    op.execute("""
DO $$ BEGIN
    CREATE TYPE linkstate AS ENUM ('active', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
""")
    op.execute("""
DO $$ BEGIN
    CREATE TYPE commentanchortype AS ENUM ('document', 'block');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
""")
    op.execute("""
DO $$ BEGIN
    CREATE TYPE commentthreadstatus AS ENUM ('open', 'resolved');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
""")

    op.execute("""
CREATE TABLE published_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    target_type VARCHAR(10) NOT NULL,
    target_id VARCHAR(512) NOT NULL,
    target_path VARCHAR(1024) NOT NULL,
    access_mode linkaccessmode NOT NULL DEFAULT 'public',
    state linkstate NOT NULL DEFAULT 'active',
    slug VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255),
    title VARCHAR(255),
    description TEXT,
    page_title VARCHAR(255),
    theme_preset VARCHAR(50) NOT NULL DEFAULT 'default',
    noindex BOOLEAN NOT NULL DEFAULT true,
    allow_comments BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    last_accessed_at TIMESTAMPTZ,
    page_metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_published_links_share_id ON published_links(share_id);
CREATE UNIQUE INDEX ix_published_links_slug ON published_links(slug);
CREATE INDEX ix_published_links_share_target ON published_links(share_id, target_type, target_id);
""")

    op.execute("""
CREATE TABLE published_link_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    published_link_id UUID NOT NULL REFERENCES published_links(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_kind VARCHAR(20) NOT NULL DEFAULT 'user',
    target_type VARCHAR(10),
    target_id VARCHAR(512),
    ip_hash VARCHAR(64),
    user_agent_summary VARCHAR(255),
    payload_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ple_published_link_id ON published_link_events(published_link_id);
CREATE INDEX ix_ple_event_type ON published_link_events(event_type);
CREATE INDEX ix_ple_link_created ON published_link_events(published_link_id, created_at);
""")

    op.execute("""
CREATE TABLE comment_threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    published_link_id UUID REFERENCES published_links(id) ON DELETE SET NULL,
    target_id VARCHAR(512) NOT NULL,
    anchor_type commentanchortype NOT NULL DEFAULT 'document',
    anchor_id VARCHAR(255),
    status commentthreadstatus NOT NULL DEFAULT 'open',
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_ct_share_id ON comment_threads(share_id);
CREATE INDEX ix_ct_share_target ON comment_threads(share_id, target_id);
""")

    op.execute("""
CREATE TABLE comment_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES comment_threads(id) ON DELETE CASCADE,
    body_markdown TEXT NOT NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    edited_at TIMESTAMPTZ
);
CREATE INDEX ix_ci_thread_id ON comment_items(thread_id);
""")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS comment_items CASCADE")
    op.execute("DROP TABLE IF EXISTS comment_threads CASCADE")
    op.execute("DROP TABLE IF EXISTS published_link_events CASCADE")
    op.execute("DROP TABLE IF EXISTS published_links CASCADE")
    op.execute("DROP TYPE IF EXISTS commentthreadstatus")
    op.execute("DROP TYPE IF EXISTS commentanchortype")
    op.execute("DROP TYPE IF EXISTS linkstate")
    op.execute("DROP TYPE IF EXISTS linkaccessmode")
