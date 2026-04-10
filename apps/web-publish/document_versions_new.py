"""Server-side document version history API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import select
from fastapi import HTTPException

from app.api import deps
from app.db import models
from app.db.session import get_db
from app.schemas import document_version as version_schema
from app.services import document_version_service
from app.services.share_service import _get_member, get_share
from app.services.web_session_service import WebSessionService

router = APIRouter(prefix="/document-versions", tags=["document-versions"])


def _has_share_membership(db: Session, share: models.Share, user_id: str | None) -> bool:
    if not user_id:
        return False
    try:
        from uuid import UUID
        user_uuid = UUID(user_id)
        if share.owner_user_id == user_uuid:
            return True
        member_stmt = select(models.ShareMember).where(
            models.ShareMember.share_id == share.id,
            models.ShareMember.user_id == user_uuid,
        )
        return db.execute(member_stmt).scalar_one_or_none() is not None
    except Exception:
        return False


def _ensure_share_access_for_history(db: Session, request: Request, share: models.Share, user: models.User | None) -> None:
    if share.visibility == models.ShareVisibility.PUBLIC:
        return
    
    if share.visibility == models.ShareVisibility.PROTECTED:
        session_token = request.cookies.get("web_session")
        if session_token:
            try:
                if WebSessionService.validate_web_session(session_token, str(share.id)):
                    return
            except HTTPException:
                pass
        
        if user and _has_share_membership(db, share, str(user.id)):
            return
            
    if share.visibility == models.ShareVisibility.PRIVATE or share.visibility == models.ShareVisibility.MEMBERS:
        if user and _has_share_membership(db, share, str(user.id)):
            return

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def _to_read(
    db: Session, version: models.DocumentVersion
) -> version_schema.DocumentVersionRead:
    created_by_email = None
    if version.created_by_user_id:
        stmt = (
            db.query(models.User.email)
            .filter(models.User.id == version.created_by_user_id)
            .limit(1)
        )
        created_by_email = stmt.scalar()
    data = version_schema.DocumentVersionRead.model_validate(version)
    data.created_by_email = created_by_email
    return data


@router.get("/shares/{share_id}", response_model=list[version_schema.DocumentVersionRead])
def list_document_versions(
    share_id: uuid.UUID,
    request: Request,
    document_path: str = Query(..., min_length=1),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(deps.get_optional_user),
):
    share = get_share(db, share_id)
    _ensure_share_access_for_history(db, request, share, current_user)
    versions = document_version_service.list_versions(db, share_id, document_path, skip=skip, limit=limit)
    return [_to_read(db, version) for version in versions]


@router.post(
    "/shares/{share_id}",
    response_model=version_schema.DocumentVersionRead,
    status_code=status.HTTP_201_CREATED,
)
def create_document_version(
    share_id: uuid.UUID,
    payload: version_schema.DocumentVersionCreate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    share = get_share(db, share_id)
    # Require actual user to create version
    if not current_user.is_admin and share.owner_user_id != current_user.id and not _get_member(db, share.id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to this share is required")
        
    version = document_version_service.create_version(
        db=db,
        share_id=share.id,
        user=current_user,
        payload=payload,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return _to_read(db, version)


@router.get("/{version_id}", response_model=version_schema.DocumentVersionRead)
def get_document_version(
    version_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(deps.get_optional_user),
):
    version = document_version_service.get_version(db, version_id)
    share = get_share(db, version.share_id)
    _ensure_share_access_for_history(db, request, share, current_user)
    return _to_read(db, version)


@router.get("/{version_id}/diff", response_model=version_schema.DocumentVersionDiffRead)
def get_document_version_diff(
    version_id: uuid.UUID,
    request: Request,
    base_version_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User | None = Depends(deps.get_optional_user),
):
    version = document_version_service.get_version(db, version_id)
    share = get_share(db, version.share_id)
    _ensure_share_access_for_history(db, request, share, current_user)
    base_version, diff_preview = document_version_service.build_diff_preview(
        db, version, base_version_id=base_version_id
    )
    return version_schema.DocumentVersionDiffRead(
        version_id=version.id,
        base_version_id=base_version.id if base_version else None,
        diff_preview=diff_preview,
    )


@router.post("/{version_id}/restore", response_model=version_schema.DocumentVersionRestoreRead)
def restore_document_version(
    version_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    version = document_version_service.get_version(db, version_id)
    share = get_share(db, version.share_id)
    
    # Require actual user to restore version
    if not current_user.is_admin and share.owner_user_id != current_user.id and not _get_member(db, share.id, current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access to this share is required")
        
    restored = document_version_service.restore_version(
        db=db,
        version=version,
        user=current_user,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )
    return version_schema.DocumentVersionRestoreRead(
        restored_version=_to_read(db, restored),
        content=version.content,
    )
