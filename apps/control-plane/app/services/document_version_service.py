"""Service layer for server-side document version snapshots."""

from __future__ import annotations

import difflib
import hashlib
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import models
from app.schemas import document_version as version_schema
from app.services import audit_service


def create_version(
    db: Session,
    share_id: uuid.UUID,
    user: models.User,
    payload: version_schema.DocumentVersionCreate,
    ip_address: str | None = None,
    user_agent: str | None = None,
    restored_from_version_id: uuid.UUID | None = None,
) -> models.DocumentVersion:
    content_hash = hashlib.sha256(payload.content.encode("utf-8")).hexdigest()
    latest = get_latest_version(db, share_id, payload.document_path)
    if latest and latest.content_hash == content_hash:
        return latest

    version = models.DocumentVersion(
        share_id=share_id,
        document_path=payload.document_path,
        content=payload.content,
        content_hash=content_hash,
        created_by_user_id=user.id,
        restored_from_version_id=restored_from_version_id,
        metadata_json=payload.metadata_json,
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    audit_service.log_action(
        db=db,
        action=models.AuditAction.DOCUMENT_VERSION_CREATED,
        actor_user_id=user.id,
        target_share_id=share_id,
        details={
            "version_id": str(version.id),
            "document_path": payload.document_path,
            "restored_from_version_id": str(restored_from_version_id)
            if restored_from_version_id
            else None,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return version


def list_versions(
    db: Session,
    share_id: uuid.UUID,
    document_path: str,
    skip: int = 0,
    limit: int = 50,
) -> list[models.DocumentVersion]:
    stmt = (
        select(models.DocumentVersion)
        .where(
            models.DocumentVersion.share_id == share_id,
            models.DocumentVersion.document_path == document_path,
        )
        .order_by(models.DocumentVersion.created_at.desc())
        .offset(skip)
        .limit(min(limit, 100))
    )
    return list(db.execute(stmt).scalars().all())


def get_version(db: Session, version_id: uuid.UUID) -> models.DocumentVersion:
    stmt = select(models.DocumentVersion).where(models.DocumentVersion.id == version_id)
    version = db.execute(stmt).scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document version not found")
    return version


def get_latest_version(
    db: Session,
    share_id: uuid.UUID,
    document_path: str,
) -> models.DocumentVersion | None:
    stmt = (
        select(models.DocumentVersion)
        .where(
            models.DocumentVersion.share_id == share_id,
            models.DocumentVersion.document_path == document_path,
        )
        .order_by(models.DocumentVersion.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def get_previous_version(
    db: Session,
    version: models.DocumentVersion,
) -> models.DocumentVersion | None:
    stmt = (
        select(models.DocumentVersion)
        .where(
            models.DocumentVersion.share_id == version.share_id,
            models.DocumentVersion.document_path == version.document_path,
            models.DocumentVersion.created_at < version.created_at,
        )
        .order_by(models.DocumentVersion.created_at.desc())
        .limit(1)
    )
    return db.execute(stmt).scalar_one_or_none()


def _validate_diff_base_version(
    version: models.DocumentVersion,
    base_version: models.DocumentVersion,
) -> None:
    if (
        base_version.share_id != version.share_id
        or base_version.document_path != version.document_path
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Base version must belong to the same document",
        )


def build_diff_preview(
    db: Session,
    version: models.DocumentVersion,
    base_version_id: uuid.UUID | None = None,
) -> tuple[models.DocumentVersion | None, str]:
    base_version = get_version(db, base_version_id) if base_version_id else get_previous_version(db, version)
    if base_version:
        _validate_diff_base_version(version, base_version)
    base_content = base_version.content if base_version else ""
    diff = difflib.unified_diff(
        base_content.splitlines(),
        version.content.splitlines(),
        fromfile=base_version.document_path if base_version else "empty",
        tofile=version.document_path,
        lineterm="",
    )
    return base_version, "\n".join(diff)


def restore_version(
    db: Session,
    version: models.DocumentVersion,
    user: models.User,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.DocumentVersion:
    restored = create_version(
        db=db,
        share_id=version.share_id,
        user=user,
        payload=version_schema.DocumentVersionCreate(
            document_path=version.document_path,
            content=version.content,
            metadata_json={"restore": True, "source_version_id": str(version.id)},
        ),
        ip_address=ip_address,
        user_agent=user_agent,
        restored_from_version_id=version.id,
    )
    audit_service.log_action(
        db=db,
        action=models.AuditAction.DOCUMENT_VERSION_RESTORED,
        actor_user_id=user.id,
        target_share_id=version.share_id,
        details={"version_id": str(version.id), "restored_version_id": str(restored.id)},
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return restored
