from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class DocumentVersionCreate(BaseModel):
    document_path: str = Field(min_length=1, max_length=1024)
    content: str
    metadata_json: dict | None = None


class DocumentVersionRead(BaseModel):
    id: uuid.UUID
    share_id: uuid.UUID
    document_path: str
    content: str
    content_hash: str
    created_by_user_id: uuid.UUID | None
    created_by_email: str | None = None
    restored_from_version_id: uuid.UUID | None
    metadata_json: dict | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DocumentVersionDiffRead(BaseModel):
    version_id: uuid.UUID
    base_version_id: uuid.UUID | None
    diff_preview: str


class DocumentVersionRestoreRead(BaseModel):
    restored_version: DocumentVersionRead
    content: str
