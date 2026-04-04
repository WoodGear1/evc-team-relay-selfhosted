from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.db.models import CommentAnchorType, CommentThreadStatus, LinkAccessMode, LinkState


# ---------------------------------------------------------------------------
# Published Links
# ---------------------------------------------------------------------------


class PublishedLinkCreate(BaseModel):
    share_id: uuid.UUID
    target_type: str = Field(pattern=r"^(file|folder)$")
    target_id: str = Field(min_length=1, max_length=512)
    target_path: str = Field(min_length=1, max_length=1024)
    access_mode: LinkAccessMode = LinkAccessMode.PUBLIC
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    title: str | None = Field(default=None, max_length=255)
    description: str | None = None
    page_title: str | None = Field(default=None, max_length=255)
    theme_preset: str = "default"
    noindex: bool = True
    allow_comments: bool = False
    expires_at: datetime | None = None
    page_metadata: dict | None = None


class PublishedLinkUpdate(BaseModel):
    access_mode: LinkAccessMode | None = None
    slug: str | None = Field(default=None, min_length=1, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    title: str | None = None
    description: str | None = None
    page_title: str | None = None
    theme_preset: str | None = None
    noindex: bool | None = None
    allow_comments: bool | None = None
    expires_at: datetime | None = None
    page_metadata: dict | None = None
    target_path: str | None = Field(default=None, min_length=1, max_length=1024)


class PublishedLinkRead(BaseModel):
    id: uuid.UUID
    share_id: uuid.UUID
    target_type: str
    target_id: str
    target_path: str
    access_mode: LinkAccessMode
    state: LinkState
    slug: str
    title: str | None
    description: str | None
    page_title: str | None
    theme_preset: str
    noindex: bool
    allow_comments: bool
    created_by: uuid.UUID | None
    revoked_by: uuid.UUID | None
    revoked_at: datetime | None
    expires_at: datetime | None
    last_accessed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    web_url: str | None = None
    page_metadata: dict | None = None

    model_config = {"from_attributes": True}


class PublishedLinkEventRead(BaseModel):
    id: uuid.UUID
    published_link_id: uuid.UUID
    event_type: str
    actor_user_id: uuid.UUID | None
    actor_kind: str
    target_type: str | None
    target_id: str | None
    ip_hash: str | None
    user_agent_summary: str | None
    payload_json: dict | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Capabilities
# ---------------------------------------------------------------------------


class UserCapabilities(BaseModel):
    can_manage_links: bool = False
    can_revoke_links: bool = False
    can_create_users: bool = False
    can_manage_members: bool = False
    can_view_audit: bool = False
    can_comment: bool = False
    can_customize_web: bool = False


# ---------------------------------------------------------------------------
# Comments
# ---------------------------------------------------------------------------


class CommentThreadCreate(BaseModel):
    target_id: str = Field(min_length=1, max_length=512)
    anchor_type: CommentAnchorType = CommentAnchorType.DOCUMENT
    anchor_id: str | None = Field(default=None, max_length=255)
    body: str = Field(min_length=1)


class CommentReplyCreate(BaseModel):
    body: str = Field(min_length=1)


class CommentItemRead(BaseModel):
    id: uuid.UUID
    thread_id: uuid.UUID
    body_markdown: str
    created_by: uuid.UUID | None
    created_by_email: str | None = None
    created_at: datetime
    edited_at: datetime | None

    model_config = {"from_attributes": True}


class CommentThreadRead(BaseModel):
    id: uuid.UUID
    share_id: uuid.UUID
    published_link_id: uuid.UUID | None
    target_id: str
    anchor_type: CommentAnchorType
    anchor_id: str | None
    status: CommentThreadStatus
    created_by: uuid.UUID | None
    created_by_email: str | None = None
    resolved_by: uuid.UUID | None
    resolved_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[CommentItemRead] = []

    model_config = {"from_attributes": True}
