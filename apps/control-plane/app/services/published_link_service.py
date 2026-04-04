"""Service layer for published links lifecycle management."""

from __future__ import annotations

import hashlib
import logging
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import security
from app.db import models
from app.schemas import published_link as link_schema
from app.services import audit_service
from app.utils import slug as slug_utils

logger = logging.getLogger(__name__)


def _hash_ip(ip: str | None) -> str | None:
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def _truncate_ua(ua: str | None) -> str | None:
    if not ua:
        return None
    return ua[:255]


def _log_link_event(
    db: Session,
    link: models.PublishedLink,
    event_type: str,
    actor_user_id: uuid.UUID | None = None,
    actor_kind: str = "user",
    ip_address: str | None = None,
    user_agent: str | None = None,
    payload: dict | None = None,
) -> models.PublishedLinkEvent:
    event = models.PublishedLinkEvent(
        published_link_id=link.id,
        event_type=event_type,
        actor_user_id=actor_user_id,
        actor_kind=actor_kind,
        target_type=link.target_type,
        target_id=link.target_id,
        ip_hash=_hash_ip(ip_address),
        user_agent_summary=_truncate_ua(user_agent),
        payload_json=payload,
    )
    db.add(event)
    return event


def create_link(
    db: Session,
    user: models.User,
    payload: link_schema.PublishedLinkCreate,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.PublishedLink:
    share = db.get(models.Share, payload.share_id)
    if not share:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Share not found")

    if not user.is_admin and share.owner_user_id != user.id:
        member = (
            db.execute(
                select(models.ShareMember).where(
                    models.ShareMember.share_id == share.id,
                    models.ShareMember.user_id == user.id,
                    models.ShareMember.role == models.ShareMemberRole.EDITOR,
                )
            )
            .scalar_one_or_none()
        )
        if not member:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only owner, admin, or editor can create links",
            )

    if payload.access_mode == models.LinkAccessMode.PROTECTED and not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password required for protected links",
        )

    if payload.slug:
        slug_candidate = slug_utils.slugify(payload.slug)
        existing = db.execute(
            select(models.PublishedLink).where(models.PublishedLink.slug == slug_candidate)
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Slug '{slug_candidate}' is already taken",
            )
        slug = slug_candidate
    else:
        slug = _generate_link_slug(db, payload.target_path)

    password_hash = None
    if payload.password:
        password_hash = security.get_password_hash(payload.password)

    link = models.PublishedLink(
        share_id=payload.share_id,
        target_type=payload.target_type,
        target_id=payload.target_id,
        target_path=payload.target_path,
        access_mode=payload.access_mode,
        state=models.LinkState.ACTIVE,
        slug=slug,
        password_hash=password_hash,
        title=payload.title,
        description=payload.description,
        page_title=payload.page_title,
        theme_preset=payload.theme_preset,
        noindex=payload.noindex,
        allow_comments=payload.allow_comments,
        created_by=user.id,
        expires_at=payload.expires_at,
        page_metadata=payload.page_metadata,
    )
    db.add(link)
    db.flush()

    _log_link_event(
        db, link, "created",
        actor_user_id=user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        payload={"access_mode": payload.access_mode.value, "slug": slug},
    )

    audit_service.log_action(
        db=db,
        action=models.AuditAction.LINK_CREATED,
        actor_user_id=user.id,
        target_share_id=payload.share_id,
        details={
            "link_id": str(link.id),
            "slug": slug,
            "access_mode": payload.access_mode.value,
            "target_type": payload.target_type,
            "target_path": payload.target_path,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(link)
    logger.info(
        "published_link.created link_id=%s share_id=%s slug=%s access_mode=%s user=%s",
        link.id, payload.share_id, slug, payload.access_mode.value, user.id,
    )
    return link


def _generate_link_slug(db: Session, path: str) -> str:
    base = slug_utils.slugify(path.rsplit("/", 1)[-1].rsplit(".", 1)[0] if "/" in path or "." in path else path)
    if not base:
        base = "link"
    candidate = base
    counter = 1
    while True:
        exists = db.execute(
            select(models.PublishedLink.id).where(models.PublishedLink.slug == candidate)
        ).scalar_one_or_none()
        if not exists:
            return candidate
        candidate = f"{base}-{counter}"
        counter += 1


def get_link(db: Session, link_id: uuid.UUID) -> models.PublishedLink:
    link = db.get(models.PublishedLink, link_id)
    if not link:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Published link not found")
    return link


def get_link_by_slug(db: Session, slug: str) -> models.PublishedLink | None:
    stmt = select(models.PublishedLink).where(
        models.PublishedLink.slug == slug,
        models.PublishedLink.state == models.LinkState.ACTIVE,
    )
    return db.execute(stmt).scalar_one_or_none()


def list_links(
    db: Session,
    share_id: uuid.UUID | None = None,
    target_type: str | None = None,
    target_id: str | None = None,
    include_revoked: bool = False,
    skip: int = 0,
    limit: int = 50,
) -> list[models.PublishedLink]:
    stmt = select(models.PublishedLink)

    if share_id:
        stmt = stmt.where(models.PublishedLink.share_id == share_id)
    if target_type:
        stmt = stmt.where(models.PublishedLink.target_type == target_type)
    if target_id:
        stmt = stmt.where(models.PublishedLink.target_id == target_id)
    if not include_revoked:
        stmt = stmt.where(models.PublishedLink.state == models.LinkState.ACTIVE)

    stmt = stmt.order_by(models.PublishedLink.created_at.desc()).offset(skip).limit(min(limit, 100))
    return list(db.execute(stmt).scalars().all())


def update_link(
    db: Session,
    link: models.PublishedLink,
    payload: link_schema.PublishedLinkUpdate,
    actor_user_id: uuid.UUID,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.PublishedLink:
    changes: dict = {}

    if payload.access_mode is not None and payload.access_mode != link.access_mode:
        changes["access_mode"] = {"old": link.access_mode.value, "new": payload.access_mode.value}
        link.access_mode = payload.access_mode
        if payload.access_mode == models.LinkAccessMode.PROTECTED and not link.password_hash and not payload.password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password required when switching to protected mode",
            )

    if payload.password:
        link.password_hash = security.get_password_hash(payload.password)
        changes["password"] = "updated"

    if payload.slug is not None:
        new_slug = slug_utils.slugify(payload.slug)
        if new_slug != link.slug:
            existing = db.execute(
                select(models.PublishedLink).where(
                    models.PublishedLink.slug == new_slug,
                    models.PublishedLink.id != link.id,
                )
            ).scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Slug '{new_slug}' is already taken",
                )
            changes["slug"] = {"old": link.slug, "new": new_slug}
            link.slug = new_slug

    for field in ("title", "description", "page_title", "theme_preset", "noindex", "allow_comments", "target_path"):
        val = getattr(payload, field, None)
        if val is not None and val != getattr(link, field):
            changes[field] = {"old": getattr(link, field), "new": val}
            setattr(link, field, val)

    if payload.expires_at is not None:
        changes["expires_at"] = "updated"
        link.expires_at = payload.expires_at

    if payload.page_metadata is not None:
        changes["page_metadata"] = "updated"
        link.page_metadata = payload.page_metadata

    if changes:
        _log_link_event(
            db, link, "updated",
            actor_user_id=actor_user_id,
            ip_address=ip_address,
            user_agent=user_agent,
            payload=changes,
        )
        audit_service.log_action(
            db=db,
            action=models.AuditAction.LINK_UPDATED,
            actor_user_id=actor_user_id,
            target_share_id=link.share_id,
            details={"link_id": str(link.id), "changes": changes},
            ip_address=ip_address,
            user_agent=user_agent,
        )

    db.commit()
    db.refresh(link)
    return link


def revoke_link(
    db: Session,
    link: models.PublishedLink,
    actor_user_id: uuid.UUID,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.PublishedLink:
    if link.state == models.LinkState.REVOKED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Link is already revoked"
        )

    link.state = models.LinkState.REVOKED
    link.revoked_by = actor_user_id
    link.revoked_at = datetime.now(timezone.utc)

    _log_link_event(
        db, link, "revoked",
        actor_user_id=actor_user_id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    audit_service.log_action(
        db=db,
        action=models.AuditAction.LINK_REVOKED,
        actor_user_id=actor_user_id,
        target_share_id=link.share_id,
        details={"link_id": str(link.id), "slug": link.slug},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(link)
    logger.info("published_link.revoked link_id=%s slug=%s user=%s", link.id, link.slug, actor_user_id)
    return link


def rotate_link(
    db: Session,
    link: models.PublishedLink,
    actor_user_id: uuid.UUID,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.PublishedLink:
    """Revoke current link and create a new one with a fresh slug."""
    if link.state != models.LinkState.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Can only rotate active links"
        )

    old_slug = link.slug
    link.state = models.LinkState.REVOKED
    link.revoked_by = actor_user_id
    link.revoked_at = datetime.now(timezone.utc)

    new_slug = _generate_link_slug(db, link.target_path)
    new_link = models.PublishedLink(
        share_id=link.share_id,
        target_type=link.target_type,
        target_id=link.target_id,
        target_path=link.target_path,
        access_mode=link.access_mode,
        state=models.LinkState.ACTIVE,
        slug=new_slug,
        password_hash=link.password_hash,
        title=link.title,
        description=link.description,
        page_title=link.page_title,
        theme_preset=link.theme_preset,
        noindex=link.noindex,
        allow_comments=link.allow_comments,
        created_by=actor_user_id,
        expires_at=link.expires_at,
        page_metadata=link.page_metadata,
    )
    db.add(new_link)
    db.flush()

    _log_link_event(
        db, link, "rotated",
        actor_user_id=actor_user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        payload={"old_slug": old_slug, "new_link_id": str(new_link.id), "new_slug": new_slug},
    )
    _log_link_event(
        db, new_link, "created_via_rotation",
        actor_user_id=actor_user_id,
        ip_address=ip_address,
        user_agent=user_agent,
        payload={"rotated_from": str(link.id), "old_slug": old_slug},
    )
    audit_service.log_action(
        db=db,
        action=models.AuditAction.LINK_ROTATED,
        actor_user_id=actor_user_id,
        target_share_id=link.share_id,
        details={
            "old_link_id": str(link.id),
            "old_slug": old_slug,
            "new_link_id": str(new_link.id),
            "new_slug": new_slug,
        },
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(new_link)
    logger.info(
        "published_link.rotated old_link_id=%s old_slug=%s new_link_id=%s new_slug=%s user=%s",
        link.id, old_slug, new_link.id, new_slug, actor_user_id,
    )
    return new_link


def restore_link(
    db: Session,
    link: models.PublishedLink,
    actor_user_id: uuid.UUID,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> models.PublishedLink:
    if link.state != models.LinkState.REVOKED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Can only restore revoked links"
        )

    slug_conflict = db.execute(
        select(models.PublishedLink).where(
            models.PublishedLink.slug == link.slug,
            models.PublishedLink.id != link.id,
            models.PublishedLink.state == models.LinkState.ACTIVE,
        )
    ).scalar_one_or_none()
    if slug_conflict:
        link.slug = _generate_link_slug(db, link.target_path)

    link.state = models.LinkState.ACTIVE
    link.revoked_by = None
    link.revoked_at = None

    _log_link_event(
        db, link, "restored",
        actor_user_id=actor_user_id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    audit_service.log_action(
        db=db,
        action=models.AuditAction.LINK_RESTORED,
        actor_user_id=actor_user_id,
        target_share_id=link.share_id,
        details={"link_id": str(link.id), "slug": link.slug},
        ip_address=ip_address,
        user_agent=user_agent,
    )

    db.commit()
    db.refresh(link)
    logger.info("published_link.restored link_id=%s slug=%s user=%s", link.id, link.slug, actor_user_id)
    return link


def list_link_events(
    db: Session,
    link_id: uuid.UUID,
    skip: int = 0,
    limit: int = 50,
) -> list[models.PublishedLinkEvent]:
    stmt = (
        select(models.PublishedLinkEvent)
        .where(models.PublishedLinkEvent.published_link_id == link_id)
        .order_by(models.PublishedLinkEvent.created_at.desc())
        .offset(skip)
        .limit(min(limit, 100))
    )
    return list(db.execute(stmt).scalars().all())


def record_access(
    db: Session,
    link: models.PublishedLink,
    granted: bool,
    user_id: uuid.UUID | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> None:
    event_type = "access_granted" if granted else "access_denied"
    _log_link_event(
        db, link, event_type,
        actor_user_id=user_id,
        actor_kind="user" if user_id else "anonymous",
        ip_address=ip_address,
        user_agent=user_agent,
    )
    link.last_accessed_at = datetime.now(timezone.utc)
    db.commit()


def get_user_capabilities(user: models.User, share: models.Share | None = None, member: models.ShareMember | None = None) -> link_schema.UserCapabilities:
    """Resolve capability flags for a user within a share context."""
    is_admin = user.is_admin
    is_owner = share and share.owner_user_id == user.id
    is_editor = member and member.role == models.ShareMemberRole.EDITOR

    return link_schema.UserCapabilities(
        can_manage_links=bool(is_admin or is_owner or is_editor),
        can_revoke_links=bool(is_admin or is_owner),
        can_create_users=is_admin,
        can_manage_members=bool(is_admin or is_owner),
        can_view_audit=bool(is_admin or is_owner),
        can_comment=True,
        can_customize_web=bool(is_admin or is_owner or is_editor),
    )
