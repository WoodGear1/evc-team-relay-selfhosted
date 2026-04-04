"""Published links CRUD/lifecycle API."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, Request, status
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from app.api import deps
from app.core.config import get_settings
from app.db import models
from app.db.session import get_db
from app.schemas import published_link as link_schema
from app.services import published_link_service
from app.services.share_service import get_share, get_web_url

router = APIRouter(prefix="/published-links", tags=["published-links"])
limiter = Limiter(key_func=get_remote_address)


def _build_link_read(link: models.PublishedLink) -> link_schema.PublishedLinkRead:
    settings = get_settings()
    web_url = None
    domain = settings.web_publish_domain
    if domain and link.state == models.LinkState.ACTIVE:
        if not domain.startswith("http"):
            domain = f"https://{domain}"
        web_url = f"{domain.rstrip('/')}/{link.slug}"
    resp = link_schema.PublishedLinkRead.model_validate(link)
    resp.web_url = web_url
    return resp


@router.post("", response_model=link_schema.PublishedLinkRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def create_published_link(
    request: Request,
    payload: link_schema.PublishedLinkCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    link = published_link_service.create_link(
        db, current_user, payload, ip_address=ip_address, user_agent=user_agent,
    )
    return _build_link_read(link)


@router.get("", response_model=list[link_schema.PublishedLinkRead])
def list_published_links(
    share_id: uuid.UUID | None = Query(default=None),
    target_type: str | None = Query(default=None),
    target_id: str | None = Query(default=None),
    include_revoked: bool = Query(default=False),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    links = published_link_service.list_links(
        db,
        share_id=share_id,
        target_type=target_type,
        target_id=target_id,
        include_revoked=include_revoked,
        skip=skip,
        limit=limit,
    )
    return [_build_link_read(l) for l in links]


@router.get("/{link_id}", response_model=link_schema.PublishedLinkRead)
def get_published_link(
    link_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    link = published_link_service.get_link(db, link_id)
    return _build_link_read(link)


@router.patch("/{link_id}", response_model=link_schema.PublishedLinkRead)
def update_published_link(
    link_id: uuid.UUID,
    request: Request,
    payload: link_schema.PublishedLinkUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    link = published_link_service.get_link(db, link_id)
    share = get_share(db, link.share_id)

    if not current_user.is_admin and share.owner_user_id != current_user.id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner or admin can update links",
        )

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    updated = published_link_service.update_link(
        db, link, payload,
        actor_user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return _build_link_read(updated)


@router.post("/{link_id}/revoke", response_model=link_schema.PublishedLinkRead)
def revoke_published_link(
    link_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    link = published_link_service.get_link(db, link_id)
    share = get_share(db, link.share_id)

    if not current_user.is_admin and share.owner_user_id != current_user.id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner or admin can revoke links",
        )

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    revoked = published_link_service.revoke_link(
        db, link, current_user.id, ip_address=ip_address, user_agent=user_agent,
    )
    return _build_link_read(revoked)


@router.post("/{link_id}/rotate", response_model=link_schema.PublishedLinkRead)
def rotate_published_link(
    link_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    link = published_link_service.get_link(db, link_id)
    share = get_share(db, link.share_id)

    if not current_user.is_admin and share.owner_user_id != current_user.id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner or admin can rotate links",
        )

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    new_link = published_link_service.rotate_link(
        db, link, current_user.id, ip_address=ip_address, user_agent=user_agent,
    )
    return _build_link_read(new_link)


@router.post("/{link_id}/restore", response_model=link_schema.PublishedLinkRead)
def restore_published_link(
    link_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    link = published_link_service.get_link(db, link_id)
    share = get_share(db, link.share_id)

    if not current_user.is_admin and share.owner_user_id != current_user.id:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only owner or admin can restore links",
        )

    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    restored = published_link_service.restore_link(
        db, link, current_user.id, ip_address=ip_address, user_agent=user_agent,
    )
    return _build_link_read(restored)


@router.get("/{link_id}/events", response_model=list[link_schema.PublishedLinkEventRead])
def list_published_link_events(
    link_id: uuid.UUID,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    link = published_link_service.get_link(db, link_id)
    events = published_link_service.list_link_events(db, link_id, skip=skip, limit=limit)
    return [link_schema.PublishedLinkEventRead.model_validate(e) for e in events]


# ---------------------------------------------------------------------------
# Capabilities endpoint
# ---------------------------------------------------------------------------


@router.get("/capabilities/me", response_model=link_schema.UserCapabilities)
def get_my_capabilities(
    share_id: uuid.UUID | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(deps.get_current_user),
):
    """Return capability flags for the current user within an optional share context."""
    share = None
    member = None
    if share_id:
        share = get_share(db, share_id)
        from sqlalchemy import select
        stmt = select(models.ShareMember).where(
            models.ShareMember.share_id == share_id,
            models.ShareMember.user_id == current_user.id,
        )
        member = db.execute(stmt).scalar_one_or_none()
    return published_link_service.get_user_capabilities(current_user, share, member)
