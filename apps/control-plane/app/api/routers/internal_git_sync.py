from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timedelta
from pathlib import PurePosixPath

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from app.api import deps
from app.core import security
from app.core.config import get_settings
from app.db import models
from app.db.session import get_db
from app.schemas import token as token_schema
from app.services.share_service import get_share

router = APIRouter(prefix="/internal/git-sync", tags=["meta"])


class InternalShareRead(BaseModel):
    id: uuid.UUID
    path: str
    kind: str
    visibility: str
    web_published: bool
    web_slug: str | None
    web_doc_id: str | None
    owner_email: str | None = None


class InternalVersionRead(BaseModel):
    id: uuid.UUID
    share_id: uuid.UUID
    share_path: str
    share_kind: str
    share_slug: str | None = None
    share_web_doc_id: str | None = None
    document_path: str
    content: str
    content_hash: str
    created_by_user_id: uuid.UUID | None
    created_by_email: str | None = None
    metadata_json: dict | None
    created_at: datetime


class GitSyncStatusRead(BaseModel):
    enabled: bool
    repo_url: str | None = None
    branch: str = "main"
    last_push_at: datetime | None = None
    last_sync_at: datetime | None = None
    total_commits: int = 0
    last_error: str | None = None


class GitSyncStatusUpdate(BaseModel):
    last_push_at: datetime | None = None
    last_sync_at: datetime | None = None
    total_commits: int | None = None
    last_error: str | None = None
    branch: str | None = None


class ImportFileRequest(BaseModel):
    path: str
    content: str


class RelayTokenInternalRead(BaseModel):
    relay_url: str
    token: str
    expires_at: datetime
    doc_id: str
    mode: str


def _compare_internal_token(provided: str | None) -> bool:
    expected = get_settings().git_sync_internal_token
    return bool(expected and provided and secrets.compare_digest(expected, provided))


def _require_internal_token(x_internal_token: str | None = Header(default=None)) -> None:
    if _compare_internal_token(x_internal_token):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Valid X-Internal-Token header is required",
    )


def _allow_status_access(
    x_internal_token: str | None = Header(default=None),
    current_user: models.User | None = Depends(deps.get_optional_user),
) -> None:
    if _compare_internal_token(x_internal_token) or current_user:
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Authentication is required",
    )


def _get_git_sync_state(request: Request) -> dict:
    state = getattr(request.app.state, "git_sync_status", None)
    if state is None:
        state = {}
        request.app.state.git_sync_status = state
    return state


@router.get("/shares", response_model=list[InternalShareRead], dependencies=[Depends(_require_internal_token)])
def list_shares(db: Session = Depends(get_db)) -> list[InternalShareRead]:
    shares = list(db.execute(select(models.Share).order_by(models.Share.created_at.asc())).scalars().all())
    owner_ids = {share.owner_user_id for share in shares}
    owner_lookup = {
        user.id: user.email
        for user in db.execute(select(models.User).where(models.User.id.in_(owner_ids))).scalars().all()
    } if owner_ids else {}
    return [
        InternalShareRead(
            id=share.id,
            path=share.path,
            kind=share.kind.value,
            visibility=share.visibility.value,
            web_published=share.web_published,
            web_slug=share.web_slug,
            web_doc_id=share.web_doc_id,
            owner_email=owner_lookup.get(share.owner_user_id),
        )
        for share in shares
    ]


@router.get("/versions", response_model=list[InternalVersionRead], dependencies=[Depends(_require_internal_token)])
def list_versions_since(
    since: datetime = Query(...),
    limit: int = Query(default=200, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> list[InternalVersionRead]:
    versions = list(
        db.execute(
            select(models.DocumentVersion)
            .where(models.DocumentVersion.created_at >= since)
            .order_by(models.DocumentVersion.created_at.asc())
            .limit(limit)
        )
        .scalars()
        .all()
    )
    if not versions:
        return []

    share_ids = {version.share_id for version in versions}
    user_ids = {version.created_by_user_id for version in versions if version.created_by_user_id}
    shares = {
        share.id: share
        for share in db.execute(select(models.Share).where(models.Share.id.in_(share_ids))).scalars().all()
    }
    users = {
        user.id: user.email
        for user in db.execute(select(models.User).where(models.User.id.in_(user_ids))).scalars().all()
    } if user_ids else {}

    return [
        InternalVersionRead(
            id=version.id,
            share_id=version.share_id,
            share_path=shares[version.share_id].path,
            share_kind=shares[version.share_id].kind.value,
            share_slug=shares[version.share_id].web_slug,
            share_web_doc_id=shares[version.share_id].web_doc_id,
            document_path=version.document_path,
            content=version.content,
            content_hash=version.content_hash,
            created_by_user_id=version.created_by_user_id,
            created_by_email=users.get(version.created_by_user_id) if version.created_by_user_id else None,
            metadata_json=version.metadata_json,
            created_at=version.created_at,
        )
        for version in versions
        if version.share_id in shares
    ]


@router.get("/status", response_model=GitSyncStatusRead, dependencies=[Depends(_allow_status_access)])
def get_git_sync_status(request: Request) -> GitSyncStatusRead:
    settings = get_settings()
    state = _get_git_sync_state(request)
    return GitSyncStatusRead(
        enabled=settings.git_sync_enabled or bool(settings.git_sync_repo_url),
        repo_url=settings.git_sync_repo_url,
        branch=state.get("branch") or settings.git_sync_branch,
        last_push_at=state.get("last_push_at"),
        last_sync_at=state.get("last_sync_at"),
        total_commits=state.get("total_commits") or 0,
        last_error=state.get("last_error"),
    )


@router.post("/status", response_model=GitSyncStatusRead, dependencies=[Depends(_require_internal_token)])
def update_git_sync_status(payload: GitSyncStatusUpdate, request: Request) -> GitSyncStatusRead:
    state = _get_git_sync_state(request)
    for key, value in payload.model_dump(exclude_unset=True).items():
        state[key] = value
    request.app.state.git_sync_status = state
    return get_git_sync_status(request)


@router.post("/shares/{share_id}/import-file", dependencies=[Depends(_require_internal_token)])
def import_file(
    share_id: uuid.UUID,
    payload: ImportFileRequest,
    db: Session = Depends(get_db),
) -> dict:
    share = get_share(db, share_id)
    normalized_path = payload.path.strip().lstrip("/")
    if not normalized_path:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="path is required")

    share.web_content_updated_at = security.utcnow()

    if share.kind == models.ShareKind.DOC:
        share.web_content = payload.content
    else:
        folder_items = list(share.web_folder_items or [])
        item_type = "canvas" if normalized_path.endswith(".canvas") else "doc"
        file_name = PurePosixPath(normalized_path).name
        updated = False
        for item in folder_items:
            if item.get("path") == normalized_path:
                item["content"] = payload.content
                item["name"] = item.get("name") or file_name
                item["type"] = item.get("type") or item_type
                updated = True
                break
        if not updated:
            folder_items.append(
                {
                    "path": normalized_path,
                    "name": file_name,
                    "type": item_type,
                    "content": payload.content,
                }
            )
        share.web_folder_items = folder_items
        flag_modified(share, "web_folder_items")

    db.commit()
    return {"message": "Imported file content", "share_id": str(share.id), "path": normalized_path}


@router.get(
    "/relay-token/{doc_id}",
    response_model=RelayTokenInternalRead,
    dependencies=[Depends(_require_internal_token)],
)
def get_relay_token(
    doc_id: str,
    request: Request,
    share_id: uuid.UUID = Query(...),
    mode: token_schema.TokenMode = Query(default=token_schema.TokenMode.WRITE),
    file_path: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> RelayTokenInternalRead:
    share = get_share(db, share_id)
    settings = get_settings()
    expires_at = security.utcnow() + timedelta(minutes=settings.relay_token_ttl_minutes)
    relay_url = str(settings.relay_public_url).rstrip("/")
    token = security.create_relay_token_cwt(
        private_key=request.app.state.relay_private_key,
        key_id=request.app.state.relay_key_id,
        doc_id=doc_id,
        mode=mode.value,
        expires_minutes=settings.relay_token_ttl_minutes,
        audience=relay_url,
    )
    return RelayTokenInternalRead(
        relay_url=relay_url,
        token=token,
        expires_at=expires_at,
        doc_id=doc_id,
        mode=mode.value,
    )
